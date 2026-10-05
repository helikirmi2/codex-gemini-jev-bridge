import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { sourceFiles, createGeminiRunner, createDelegate, evaluate, deniedActions, retainExplicitCreditFlag } from '../core.mjs';
import { ExactCache, reviewPlan, bytes } from '../performance.mjs';

async function temporary(t) {
  const parent = path.resolve(process.env.BRIDGE_TEST_TMPDIR || os.tmpdir());
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'bridge-performance-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), parent);
    assert.ok(path.basename(root).startsWith('bridge-performance-test-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}
const config = { geminiModel: 'gemini-test', geminiBackend: 'antigravity-subscription', geminiEntry: 'synthetic-cli', runtimeDirectory: 'synthetic-runtime', geminiTimeoutSeconds: 10 };
const profile = () => ({ useG1Credits: false, permissions: { deny: [...deniedActions] } });
const success = { status: 'SUCCESS', response: 'A synthetic draft.', usage: { input_tokens: 42 }, num_turns: 1, duration_seconds: 2 };
const runner = overrides => createGeminiRunner({ config: { ...config }, assertReady: () => {}, loadProfile: async () => profile(), prepareRuntime: async () => {}, start: async () => structuredClone(success), finalizeProfile: async () => {}, sanitize: String, ...overrides });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('ranges transmit only selected inclusive lines, preserve labels, reject EOF and canonical whole/range conflicts', async t => {
  const root = await temporary(t);
  const file = path.join(root, 'source.txt');
  await fs.writeFile(file, 'PRIVATE HEADER\r\nalpha\r\nβeta\r\nPRIVATE FOOTER\r\n');
  const local = { sourceRoots: [root], keyFile: path.join(root, 'unused-key') };
  const selections = [{ path: file, start_line: 2, end_line: 3 }];
  const sources = await sourceFiles([], local, selections);
  assert.deepEqual(sources, [{ file: await fs.realpath(file), range: { start_line: 2, end_line: 3 }, content: 'alpha\nβeta' }]);
  assert.ok(bytes(sources[0].content) < bytes(await fs.readFile(file, 'utf8')));
  for (const [start_line, end_line] of [[0, 2], [3, 2], [2, 5], [1.5, 3], [1, 999]]) await assert.rejects(sourceFiles([], local, [{ path: file, start_line, end_line }]));
  await assert.rejects(sourceFiles([file], local, [{ path: path.join(root, 'sub', '..', 'source.txt'), start_line: 1, end_line: 1 }]), /both whole/);
  await assert.rejects(sourceFiles([], local, [selections[0], selections[0]]), /Duplicate/);
});

test('range selection retains credential, directory, binary, per-file and aggregate limits', async t => {
  const root = await temporary(t);
  const local = { sourceRoots: [root], keyFile: path.join(root, 'unused-key') };
  await fs.mkdir(path.join(root, '.secrets'));
  for (const [name, content] of [['settings.json', '{}'], ['.secrets/data.txt', 'private'], ['binary.txt', '\0'], ['large.txt', 'x'.repeat(200_001)]]) {
    const file = path.join(root, name);
    await fs.writeFile(file, content);
    await assert.rejects(sourceFiles([], local, [{ path: file, start_line: 1, end_line: 1 }]));
  }
  const file = path.join(root, 'within-limit.txt');
  await fs.writeFile(file, 'x'.repeat(199_992) + '\na\nb\nc\n');
  await assert.rejects(sourceFiles([], local, [1, 2, 3, 4].map(end_line => ({ path: file, start_line: 1, end_line }))), /600 KB/);
  await assert.rejects(sourceFiles([], local, [{ path: path.join(path.dirname(root), 'outside.txt'), start_line: 1, end_line: 1 }]));
  await assert.rejects(sourceFiles([], local, Array.from({ length: 21 }, () => ({ path: file, start_line: 1, end_line: 1 }))), /20/);
});

test('review mapping sends shared evidence once, drops unused sources and honors explicit empty evidence/context', () => {
  const sources = ['shared', 'unused', 'specific'].map(content => ({ file: content + '.txt', content }));
  const plan = reviewPlan({ task: 'task', context: 'draft-only', review_context: 'review-only', sources, review_checks: ['a', 'b', 'c'], review_evidence: [{ source_indices: [0, 0, 2], context: 'criterion A' }, { source_indices: [0] }, { source_indices: [] }] });
  assert.equal(plan.context, 'review-only');
  assert.deepEqual(plan.sources.map(source => source.source_index), [0, 2]);
  assert.deepEqual(plan.evidence_by_check.check_1, { source_indices: [0, 2], context: 'criterion A' });
  assert.deepEqual(plan.evidence_by_check.check_3.source_indices, []);
  assert.ok(!JSON.stringify(plan).includes('draft-only'));
  const legacy = reviewPlan({ task: 'task', context: 'legacy', sources, review_checks: ['a'] });
  assert.equal(legacy.context, 'legacy');
  assert.equal(legacy.sources.length, 3);
  assert.deepEqual(legacy.evidence_by_check.check_1.source_indices, [0, 1, 2]);
  for (const evidence of [[], [{ source_indices: [3] }], [{ source_indices: [-1] }], [{}]]) assert.throws(() => reviewPlan({ task: 'task', sources, review_checks: ['a'], review_evidence: evidence }));
});

test('cache expiration is fixed, values are isolated and memory/count bounds evict old entries', () => {
  let now = 0;
  const cache = new ExactCache({ maxEntries: 2, maxBytes: 80, ttlMs: 100, now: () => now });
  cache.set('a', { answer: 'first' });
  const value = cache.get('a'); value.answer = 'mutated';
  assert.equal(cache.get('a').answer, 'first');
  now = 90; assert.ok(cache.get('a'));
  now = 100; assert.equal(cache.get('a'), undefined);
  cache.set('a', { answer: 'first' }); cache.set('b', { answer: 'second' }); cache.set('c', { answer: 'third' });
  assert.equal(cache.get('a'), undefined);
  cache.set('oversize', { answer: 'x'.repeat(81) });
  assert.equal(cache.get('oversize'), undefined);
  assert.ok(cache.entries.size <= 2 && cache.sizeBytes <= 80);
  cache.set('d', { answer: 'x'.repeat(60) });
  assert.equal(cache.entries.size, 1);
});

test('Gemini cache includes content/model/policy, gates each hit and reports zero new usage', async () => {
  let calls = 0, guards = 0, valid = true;
  const localConfig = { ...config };
  const run = runner({ config: localConfig, loadProfile: async () => { guards++; return { ...profile(), useG1Credits: valid ? false : true }; }, start: async () => { calls++; return success; } });
  const first = await run('task', 'context', [{ content: 'one' }]);
  const second = await run('task', 'context', [{ content: 'one' }]);
  assert.equal(first.stats.cached, false);
  assert.equal(second.stats.cached, true);
  assert.equal(second.stats.provider_calls, 0);
  assert.equal(second.stats.usage, null);
  assert.deepEqual(second.stats.original_usage, success.usage);
  assert.equal(calls, 1); assert.equal(guards, 2);
  await run('task', 'context', [{ content: 'two' }]);
  localConfig.geminiModel = 'gemini-another';
  await run('task', 'context', [{ content: 'two' }]);
  assert.equal(calls, 3);
  valid = false;
  await assert.rejects(run('task', 'context', [{ content: 'two' }]), /useG1Credits/);
  assert.equal(calls, 3);
});

test('distinct Gemini tasks cannot race during asynchronous preparation; identical tasks coalesce', async () => {
  const preparation = deferred(), entered = deferred();
  let starts = 0, prepares = 0;
  const run = runner({ prepareRuntime: async () => { prepares++; entered.resolve(); await preparation.promise; }, start: async () => { starts++; return success; } });
  const first = run('same', '', []);
  await entered.promise;
  const duplicate = run('same', '', []);
  await assert.rejects(run('different', '', []), /already running/);
  assert.equal(prepares, 1); assert.equal(starts, 0);
  preparation.resolve();
  const [a, b] = await Promise.all([first, duplicate]);
  assert.equal(starts, 1); assert.equal(a.response, b.response);
  assert.equal(a.stats.provider_calls, 1);
  assert.equal(b.stats.coalesced, true); assert.equal(b.stats.provider_calls, 0);
});

test('failed preparation and provider errors release the lock without caching failures or using fallback', async () => {
  let prepares = 0, starts = 0;
  const run = runner({ prepareRuntime: async () => { if (++prepares === 1) throw new Error('prepare failed'); }, start: async () => { if (++starts === 1) return { status: 'ERROR', error: 'synthetic quota failure' }; return success; } });
  await assert.rejects(run('task', '', []), /prepare failed/);
  await assert.rejects(run('task', '', []), /quota failure.*No billing fallback/);
  assert.equal((await run('task', '', [])).response, success.response);
  assert.equal(prepares, 3); assert.equal(starts, 2);
});

test('CLI sparse profile persistence restores only an omitted false credit flag, preserving other settings', async t => {
  const root = await temporary(t);
  const file = path.join(root, 'profile.json');
  const sparse = { permissions: profile().permissions, theme: 'synthetic', unrelated: { keep: true } };
  await fs.writeFile(file, JSON.stringify(sparse));
  await retainExplicitCreditFlag(file);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { ...sparse, useG1Credits: false });
  for (const unsafe of [{ ...sparse, useG1Credits: true }, { ...sparse, useG1Credits: null }, { ...sparse, modelProvider: 'external' }, { ...sparse, permissions: {} }]) {
    const text = JSON.stringify(unsafe);
    await fs.writeFile(file, text);
    await assert.rejects(retainExplicitCreditFlag(file));
    assert.equal(await fs.readFile(file, 'utf8'), text);
  }
});

test('delegation validates evidence before providers and separates drafting from review', async t => {
  const root = await temporary(t);
  let generationCalls = 0, actualState;
  const sources = [{ file: 'a.txt', content: 'included' }, { file: 'b.txt', content: 'excluded' }];
  const run = createDelegate({ artifactDirectory: root, loadSources: async () => sources, runGemini: async (_, context) => { generationCalls++; assert.equal(context, 'draft context'); return { response: 'D'.repeat(2000), stats: { provider_calls: 1 } }; }, runReview: async (state, questions) => {
    actualState = state;
    assert.match(questions.check_1.instructions, /ONLY/);
    return { model: 'synthetic-jev', answers: { check_1: { choice: 'pass', confidence: 0.99, probabilities: { pass: 0.99 } } }, usage: { input_tokens: 8 }, current_usage: { input_tokens: 8 }, provider_calls: 1, cached: false };
  } });
  const args = { task: 'task', context: 'draft context', review_checks: ['criterion'], review_context: 'review context', review_evidence: [{ source_indices: [0] }] };
  await assert.rejects(run({ ...args, review_evidence: [{ source_indices: [2] }] }), /index/);
  assert.equal(generationCalls, 0);
  const compact = await run(args);
  assert.equal(actualState.context, 'review context'); assert.equal(actualState.sources.length, 1);
  assert.equal(compact.preview.length, 400); assert.equal(compact.truncated, true);
  assert.equal(compact.verdict, 'checks_passed');
  assert.equal(compact.review.answers.check_1.probabilities, undefined);
  assert.equal(compact.metrics.source_bytes, bytes('includedexcluded'));
  assert.equal(compact.metrics.review_source_bytes, bytes('included'));
  const report = JSON.parse(await fs.readFile(compact.metadata_file, 'utf8'));
  assert.equal(report.review.answers.check_1.probabilities.pass, 0.99);
  assert.equal((await fs.readFile(compact.result_file, 'utf8')).length, 2000);
  const full = await run({ ...args, response_mode: 'full' });
  assert.equal(full.preview.length, 1600);
  assert.ok(bytes(compact) < bytes(full));
});

test('failed Jev checks retain the draft and never claim verification', async t => {
  const root = await temporary(t);
  const run = createDelegate({ artifactDirectory: root, loadSources: async () => [], runGemini: async () => ({ response: 'saved draft', stats: { provider_calls: 1 } }), runReview: async () => { throw new Error('synthetic auth failure'); } });
  const result = await run({ task: 'task', review_checks: ['criterion'] });
  assert.equal(result.verdict, 'needs_codex_review');
  assert.equal(result.review.error, 'synthetic auth failure');
  assert.equal(result.metrics.jev_provider_calls, null);
  assert.equal(await fs.readFile(result.result_file, 'utf8'), 'saved draft');
});

test('Jev exact cache expires and reports original versus current usage separately; errors are not cached', async () => {
  let now = 0, calls = 0;
  const requestCache = new ExactCache({ now: () => now, ttlMs: 100 });
  const options = { config: { jevModel: 'synthetic', jevTimeoutSeconds: 5 }, assertReady: () => {}, keyImpl: () => 'synthetic-test-only-token', sanitize: String, requestCache, fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({ model: 'synthetic', usage: { input_tokens: 4 }, answers: { a: { type: 'choice', choice: 'pass', confidence: 0.99 } } }) }; } };
  const questions = { a: { type: 'choice', instructions: 'criterion', criteria: { pass: 'yes', fail: 'no' } } };
  assert.equal((await evaluate({ task: 'a' }, questions, options)).provider_calls, 1);
  const cached = await evaluate({ task: 'a' }, questions, options);
  assert.equal(cached.cached, true); assert.equal(cached.current_usage, null); assert.equal(cached.provider_calls, 0);
  now = 100;
  await evaluate({ task: 'a' }, questions, options); assert.equal(calls, 2);
  await evaluate({ task: 'b' }, questions, options); assert.equal(calls, 3);
  const bad = { ...options, fetchImpl: async () => { calls++; return { ok: false, status: 429 }; } };
  await assert.rejects(evaluate({ task: 'c' }, questions, bad), /429/);
  await assert.rejects(evaluate({ task: 'c' }, questions, bad), /429/);
  assert.equal(calls, 5);
});
