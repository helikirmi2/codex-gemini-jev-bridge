import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { directory, settings, assertConfigured } from './config.mjs';
import { deniedActions } from './core.mjs';

const configStart = '# BEGIN GEMINI-JEV BRIDGE';
const configEnd = '# END GEMINI-JEV BRIDGE';
const rulesStart = '<!-- BEGIN GEMINI-JEV BRIDGE -->';
const rulesEnd = '<!-- END GEMINI-JEV BRIDGE -->';
const readOptional = file => fs.readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });

export function replaceBlock(existing, start, end, block) {
  const first = existing.indexOf(start), last = existing.indexOf(end);
  if ((first >= 0) !== (last >= 0) || (first >= 0 && (last < first || existing.indexOf(start, first + start.length) >= 0 || existing.indexOf(end, last + end.length) >= 0))) throw new Error('Integration markers are incomplete or duplicated; refusing to overwrite.');
  return first < 0 ? `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${block}\n` : existing.slice(0, first) + block + existing.slice(last + end.length);
}

export async function makePlan({ codexDirectory = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), agySettingsPath = settings.antigravitySettingsFile, bridgeDirectory = directory } = {}) {
  const configPath = path.join(codexDirectory, 'config.toml');
  const agentsPath = path.join(codexDirectory, 'AGENTS.md');
  const oldConfig = await readOptional(configPath);
  const oldRules = await readOptional(agentsPath);
  const oldAgy = await readOptional(agySettingsPath);
  let agy;
  try { agy = oldAgy ? JSON.parse(oldAgy.replace(/^\uFEFF/, '')) : {}; }
  catch { throw new Error('Antigravity settings are invalid JSON; no files changed.'); }
  if (!agy || typeof agy !== 'object' || Array.isArray(agy)) throw new Error('Antigravity settings must be an object.');
  if (agy.permissions != null && (typeof agy.permissions !== 'object' || Array.isArray(agy.permissions))) throw new Error('Invalid Antigravity permissions.');
  if (agy.permissions?.deny != null && !Array.isArray(agy.permissions.deny)) throw new Error('Invalid Antigravity deny list.');
  const config = oldConfig || '';
  // Validate marker structure before stripping the managed block for conflict detection.
  replaceBlock(config, configStart, configEnd, '');
  const outside = config.includes(configStart) ? config.slice(0, config.indexOf(configStart)) + config.slice(config.indexOf(configEnd) + configEnd.length) : config;
  if (/^\s*\[\s*mcp_servers\.(?:"gemini-jev"|'gemini-jev'|gemini-jev)\s*\]/m.test(outside)) throw new Error('An unmanaged gemini-jev entry exists; no files changed.');
  const block = `${configStart}\n[mcp_servers.gemini-jev]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(bridgeDirectory, 'server.mjs'))}]\nstartup_timeout_sec = 20\ntool_timeout_sec = 300\nenabled = true\n${configEnd}`;
  const instructions = await fs.readFile(path.join(bridgeDirectory, 'docs', 'DELEGATION.md'), 'utf8');
  const rules = `${rulesStart}\n${instructions.trim()}\n\nBridge implementation: ${bridgeDirectory.replaceAll('\\', '/')}\n${rulesEnd}`;
  delete agy.modelProvider;
  agy.useG1Credits = false;
  agy.toolPermission = 'strict';
  agy.allowNonWorkspaceAccess = false;
  agy.permissions ??= {};
  agy.permissions.deny = [...new Set([...(agy.permissions.deny || []), ...deniedActions])];
  // Parse every target and build the whole plan before writing anything.
  return [
    { file: agySettingsPath, before: oldAgy, after: JSON.stringify(agy, null, 2) + '\n' },
    { file: agentsPath, before: oldRules, after: replaceBlock(oldRules || '', rulesStart, rulesEnd, rules) },
    { file: configPath, before: oldConfig, after: replaceBlock(config, configStart, configEnd, block) },
  ].filter(change => change.before !== change.after);
}

export async function applyPlan(plan) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const change of plan) {
    if (await readOptional(change.file) !== change.before) throw new Error('Configuration changed after planning; rerun installation.');
  }
  // Back up all existing targets before the first write; keep backups local.
  for (const change of plan) {
    await fs.mkdir(path.dirname(change.file), { recursive: true });
    if (change.before !== null) await fs.copyFile(change.file, `${change.file}.before-gemini-jev-${timestamp}`);
  }
  for (const change of plan) await fs.writeFile(change.file, change.after, { mode: 0o600 });
  return { changed_files: plan.map(change => change.file), backup_timestamp: timestamp };
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: node install.mjs [--apply]');
  assertConfigured();
  const plan = await makePlan();
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', files: plan.map(change => change.file), effects: ['Registers this folder as Codex gemini-jev MCP server.', 'Adds delegation instructions to user AGENTS.md.', 'Disables paid credits/API provider and all helper tools in the global Antigravity CLI profile. Manual CLI sessions also inherit these restrictions.'] }, null, 2));
  if (!process.argv.includes('--apply')) { console.log('No changes made. Review the plan, then run node install.mjs --apply.'); return; }
  await fs.access(settings.geminiEntry);
  if (!settings.geminiModel.startsWith('gemini-')) throw new Error('Choose an available Gemini model in settings.json before applying.');
  for (const root of settings.sourceRoots) if (!(await fs.stat(root)).isDirectory()) throw new Error('Every sourceRoots entry must be an existing directory.');
  console.log(JSON.stringify(await applyPlan(plan)));
  console.log('Restart Codex to load the tools. Live authentication has not been tested.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
