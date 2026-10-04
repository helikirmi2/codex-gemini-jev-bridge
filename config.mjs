import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const directory = path.dirname(fileURLToPath(import.meta.url));
export function resolveLocalPath(value, base = directory, home = os.homedir()) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Invalid local path in settings.');
  if (value === '~') return home;
  if (/^~[/\\]/.test(value)) return path.resolve(home, value.slice(2));
  return path.resolve(base, value);
}

export function loadSettings(base = directory, home = os.homedir()) {
  const settingsFile = path.join(base, 'settings.json');
  const configured = fs.existsSync(settingsFile);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(configured ? settingsFile : path.join(base, 'settings.example.json'), 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('Cannot parse local settings. Run node setup.mjs and check settings.json.'); }
  const fields = ['keyFile', 'sourceRoots', 'geminiEntry', 'geminiModel', 'jevModel', 'runtimeDirectory', 'geminiTimeoutSeconds', 'jevTimeoutSeconds'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !fields.includes(key))) throw new Error('Unknown settings field. Store credentials in a key file or environment variable, never in settings.json.');
  if (!Array.isArray(raw.sourceRoots) || raw.sourceRoots.length > 20) throw new Error('sourceRoots must be an array with at most 20 paths.');
  for (const [field, min, max] of [['geminiTimeoutSeconds', 10, 180], ['jevTimeoutSeconds', 5, 45]]) {
    if (!Number.isInteger(raw[field]) || raw[field] < min || raw[field] > max) throw new Error(`Invalid ${field}; allowed range ${min}-${max}.`);
  }
  if (typeof raw.geminiModel !== 'string' || typeof raw.jevModel !== 'string' || !raw.jevModel.trim()) throw new Error('Model names must be nonempty strings.');
  const result = { ...raw, configured, geminiBackend: 'antigravity-subscription', antigravitySettingsFile: path.join(home, '.gemini', 'antigravity-cli', 'settings.json') };
  for (const name of ['keyFile', 'geminiEntry', 'runtimeDirectory']) result[name] = resolveLocalPath(raw[name], base, home);
  result.sourceRoots = raw.sourceRoots.map(value => resolveLocalPath(value, base, home));
  return result;
}

export const settings = loadSettings();
export function assertConfigured() {
  if (!settings.configured) throw new Error('Local settings.json is missing. Run node setup.mjs and configure the bridge first.');
}
