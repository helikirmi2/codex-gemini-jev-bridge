import fs from 'node:fs/promises';
import path from 'node:path';
import { directory } from './config.mjs';

const target = path.join(directory, 'settings.json');
const template = JSON.parse(await fs.readFile(path.join(directory, 'settings.example.json'), 'utf8'));
if (process.platform !== 'win32') template.geminiEntry = '~/.local/bin/agy';
try {
  await fs.writeFile(target, JSON.stringify(template, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await fs.mkdir(path.join(directory, '.secrets'), { recursive: true, mode: 0o700 });
  console.log('Created ignored settings.json. Set sourceRoots, geminiEntry and geminiModel; store the TypeSafe key separately.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('settings.json already exists; no changes made.');
}
