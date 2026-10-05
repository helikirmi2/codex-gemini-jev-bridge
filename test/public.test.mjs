import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPublic, inspectText } from '../scripts/check-public.mjs';

test('public artifact allowlist and common leak scan pass', async () => {
  const result = await checkPublic();
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

test('scanner reports categories without exposing detected values', () => {
  const fake = ['AIza', 'A'.repeat(35)].join('');
  const findings = inspectText(fake);
  assert.ok(findings.includes('google-key'));
  assert.ok(!JSON.stringify(findings).includes(fake));
  assert.deepEqual(inspectText('A public synthetic example.'), []);
});
