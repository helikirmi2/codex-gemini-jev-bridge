import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localNames = new Set(['.git', 'node_modules', 'settings.json', 'settings.local.json', '.secrets', '.runtime', 'results', 'logs', 'coverage']);
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['google-key', /AIza[0-9A-Za-z_-]{30,}/],
  ['github-token', /(?:gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{30,})/],
  ['api-token', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/],
  ['personal-home-path', /(?:[A-Za-z]:[\\/]+Users[\\/]+[^\s"'<>\\/]+|\/(?:Users|home)\/[a-zA-Z0-9_.-]+\/)/],
  ['email-address', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
];

export function inspectText(text) {
  // Never return matching values; a diagnostic must not disclose a detected secret.
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

async function candidates(base, prefix = '') {
  const found = [];
  for (const entry of await fs.readdir(path.join(base, prefix), { withFileTypes: true })) {
    if (localNames.has(entry.name) || entry.name.startsWith('.env') || /(?:API_KEY|\.log$|\.before-gemini-jev-|\.zip$)/i.test(entry.name)) continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await candidates(base, name));
    else found.push(name);
  }
  return found;
}

export async function checkPublic(base = root) {
  const manifest = JSON.parse(await fs.readFile(path.join(base, 'public-files.json'), 'utf8'));
  if (!Array.isArray(manifest) || manifest.some(name => typeof name !== 'string' || path.isAbsolute(name) || name.split(/[\\/]/).includes('..'))) throw new Error('Invalid public file manifest.');
  const allowed = new Set(manifest);
  if (allowed.size !== manifest.length) throw new Error('Duplicate public file manifest entry.');
  let gitFiles = [];
  if (await fs.lstat(path.join(base, '.git')).then(() => true, () => false)) {
    gitFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: base, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
  }
  const files = new Set([...manifest, ...gitFiles, ...await candidates(base)]);
  const findings = [];
  for (const name of files) {
    if (!allowed.has(name)) { findings.push({ file: name, issue: 'not-in-public-allowlist' }); continue; }
    const target = path.join(base, name);
    const stat = await fs.lstat(target).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink()) { findings.push({ file: name, issue: 'missing-or-nonregular-file' }); continue; }
    const content = await fs.readFile(target, 'utf8');
    for (const issue of inspectText(content)) findings.push({ file: name, issue });
    if (gitFiles.includes(name)) {
      // Inspect the staged version too: a clean working file can conceal a leaked staged blob.
      try {
        const staged = execFileSync('git', ['show', `:${name}`], { cwd: base, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        for (const issue of inspectText(staged)) findings.push({ file: name, issue: `staged-${issue}` });
      } catch (error) { if (error.status !== 128) throw error; } // Untracked files have no staged blob.
    }
  }
  return { ok: findings.length === 0, checked_files: manifest.length, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  checkPublic().then(result => { console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; })
    .catch(() => { console.error('Public file check could not complete. Check the manifest and Git state.'); process.exitCode = 1; });
}
