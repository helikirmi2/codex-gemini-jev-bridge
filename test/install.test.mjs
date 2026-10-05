import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { makePlan, applyPlan, replaceBlock } from '../install.mjs';
import { validateSubscriptionSettings } from '../core.mjs';

async function fixture(t) {
  const parent = path.resolve(process.env.BRIDGE_TEST_TMPDIR || os.tmpdir());
  await fs.mkdir(parent, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(parent, 'bridge-install-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(tempRoot)), parent);
    assert.ok(path.basename(tempRoot).startsWith('bridge-install-test-'));
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const codexDirectory = path.join(tempRoot, 'codex');
  const agySettingsPath = path.join(tempRoot, 'agy', 'settings.json');
  await fs.mkdir(codexDirectory);
  await fs.mkdir(path.dirname(agySettingsPath));
  return { tempRoot, codexDirectory, agySettingsPath };
}

test('preview does not write; apply preserves settings, backs up, and is idempotent', async t => {
  const f = await fixture(t);
  const config = path.join(f.codexDirectory, 'config.toml');
  const agents = path.join(f.codexDirectory, 'AGENTS.md');
  await fs.writeFile(config, '# Existing configuration\n[features]\nexample = true\n');
  await fs.writeFile(agents, '# Existing instructions\nKeep this rule.\n');
  await fs.writeFile(f.agySettingsPath, JSON.stringify({ theme: 'dark', modelProvider: 'gemini', useG1Credits: true, permissions: { deny: ['existing(*)'] } }));
  const before = await fs.readFile(config, 'utf8');
  const plan = await makePlan(f);
  assert.equal(await fs.readFile(config, 'utf8'), before);
  assert.equal(plan.length, 3);
  await applyPlan(plan);
  assert.ok((await fs.readFile(config, 'utf8')).startsWith(before.trimEnd()));
  assert.ok((await fs.readFile(agents, 'utf8')).includes('Keep this rule.'));
  const agy = JSON.parse(await fs.readFile(f.agySettingsPath, 'utf8'));
  assert.equal(agy.theme, 'dark');
  assert.ok(agy.permissions.deny.includes('existing(*)'));
  validateSubscriptionSettings(agy);
  assert.equal((await fs.readdir(f.codexDirectory)).filter(name => name.includes('.before-gemini-jev-')).length, 2);
  assert.deepEqual(await makePlan(f), []);
});

test('fresh profiles are supported without reading or changing real user configuration', async t => {
  const f = await fixture(t);
  const plan = await makePlan(f);
  assert.equal(plan.length, 3);
  await applyPlan(plan);
  assert.deepEqual(await makePlan(f), []);
});

test('invalid or conflicting configuration fails before any write', async t => {
  const f = await fixture(t);
  const config = path.join(f.codexDirectory, 'config.toml');
  await fs.writeFile(config, '[mcp_servers.gemini-jev]\ncommand = "existing"\n');
  await assert.rejects(makePlan(f), /unmanaged/);
  await fs.writeFile(config, '# Keep this\n');
  await fs.writeFile(f.agySettingsPath, '{ invalid private text');
  await assert.rejects(makePlan(f), error => error.message.includes('invalid JSON') && !error.message.includes('private text'));
  assert.equal(await fs.readFile(config, 'utf8'), '# Keep this\n');
});

test('stale installation plans refuse to overwrite concurrent edits', async t => {
  const f = await fixture(t);
  const plan = await makePlan(f);
  await fs.writeFile(f.agySettingsPath, '{"newSetting":true}');
  await assert.rejects(applyPlan(plan), /changed after planning/);
  assert.deepEqual(await fs.readdir(f.codexDirectory), []);
});

test('incomplete and duplicated managed markers are rejected', () => {
  for (const input of ['START only', 'END before START', 'START END START END']) assert.throws(() => replaceBlock(input, 'START', 'END', 'new'));
});
