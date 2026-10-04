import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseKey, sourceFiles, reviewDecision, validateSubscriptionSettings, deniedActions } from '../core.mjs';
import { loadSettings, resolveLocalPath, directory } from '../config.mjs';

async function temporary(t) {
  const parent = path.resolve(process.env.BRIDGE_TEST_TMPDIR || os.tmpdir());
  await fs.mkdir(parent, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(parent, 'bridge-core-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(tempRoot)), parent);
    assert.ok(path.basename(tempRoot).startsWith('bridge-core-test-'));
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  return tempRoot;
}

test('key parser supports file formats without returning rejected input in errors', () => {
  const token = 'synthetic-test-value-at-least-twenty-characters';
  for (const input of [token, '\uFEFF' + token + '\n', `TYPESAFE_API_KEY="${token}"`, JSON.stringify({ TYPESAFE_API_KEY: token })]) assert.equal(parseKey(input), token);
  assert.throws(() => parseKey('private rejected value'), error => !error.message.includes('private rejected value'));
});

test('selected sources reject credentials, config directories, binary data and outside paths', async t => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, '.secrets'));
  await fs.mkdir(path.join(root, '.CoDeX'));
  const files = { 'source.txt': 'Allowed text.', 'TYPESAFE_API_KEY': 'SYNTHETIC_TEST_VALUE_ONLY', 'settings.json': '{}', '.secrets/innocent.txt': 'private', '.CoDeX/config.toml': 'test = true', 'binary.bin': '\0' };
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(root, name), content);
  const config = { keyFile: path.join(root, 'TYPESAFE_API_KEY'), sourceRoots: [root] };
  assert.equal((await sourceFiles([path.join(root, 'source.txt')], config))[0].content, 'Allowed text.');
  for (const name of ['TYPESAFE_API_KEY', 'settings.json', '.secrets/innocent.txt', '.CoDeX/config.toml', 'binary.bin']) await assert.rejects(sourceFiles([path.join(root, name)], config));
  await assert.rejects(sourceFiles([path.join(directory, 'package.json')], config), /outside/);
  await assert.rejects(sourceFiles(['source.txt'], config), /absolute/);
  assert.deepEqual(await sourceFiles([], { sourceRoots: [path.join(root, 'missing')] }), []);
});

test('uncertain, failed and empty reviews require primary assistant review', () => {
  assert.equal(reviewDecision({}), 'needs_codex_review');
  assert.equal(reviewDecision({ a: { choice: 'pass', confidence: 0.99 } }), 'checks_passed');
  for (const answer of [{ choice: 'pass', confidence: 0.5 }, { choice: 'fail', confidence: 0.99 }, { choice: 'insufficient', confidence: 1 }]) assert.equal(reviewDecision({ a: answer }), 'needs_codex_review');
});

test('subscription gate refuses overages, API providers and changed tool restrictions', () => {
  const valid = { useG1Credits: false, permissions: { deny: deniedActions } };
  assert.doesNotThrow(() => validateSubscriptionSettings(valid));
  for (const config of [{ ...valid, useG1Credits: true }, { permissions: valid.permissions }, { ...valid, modelProvider: 'gemini' }, { ...valid, permissions: {} }]) assert.throws(() => validateSubscriptionSettings(config));
});

test('settings are portable, reject secret fields, and enforce timeout budgets', async t => {
  const root = await temporary(t);
  const home = path.join(root, 'profile');
  const template = JSON.parse(await fs.readFile(path.join(directory, 'settings.example.json'), 'utf8'));
  await fs.writeFile(path.join(root, 'settings.example.json'), JSON.stringify(template));
  const defaults = loadSettings(root, home);
  assert.equal(defaults.configured, false);
  assert.equal(defaults.keyFile, path.join(root, '.secrets', 'TYPESAFE_API_KEY'));
  assert.equal(resolveLocalPath('~/projects', root, home), path.join(home, 'projects'));
  assert.equal(defaults.antigravitySettingsFile, path.join(home, '.gemini', 'antigravity-cli', 'settings.json'));
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ ...template, apiKey: 'do-not-store-here' }));
  assert.throws(() => loadSettings(root, home), /Unknown settings/);
  await fs.writeFile(path.join(root, 'settings.json'), JSON.stringify({ ...template, geminiTimeoutSeconds: 9999 }));
  assert.throws(() => loadSettings(root, home), /allowed range/);
});
