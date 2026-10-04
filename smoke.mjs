import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { directory } from './core.mjs';
import path from 'node:path';

const client = new Client({ name: 'bridge-smoke', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(directory, 'server.mjs')], stderr: 'pipe' }));
  const list = await client.listTools();
  assert.equal(list.tools.length, 3);
  console.log('MCP handshake: OK; tools: ' + list.tools.map(tool => tool.name).join(', '));
  const health = await client.callTool({ name: 'bridge_status', arguments: {} });
  console.log(health.content[0].text);
  if (process.argv.includes('--jev-only')) {
    const response = await client.callTool({ name: 'jev_evaluate', arguments: {
      context: 'The document states: The cube is blue. It has six faces.', files: [],
      questions: {
        colour: { type: 'choice', instructions: 'Which colour does the supplied document explicitly give for the cube?', criteria: { blue: 'Blue', red: 'Red', unspecified: 'No colour specified' } },
        false_claim: { type: 'choice', instructions: 'Does the supplied document support the claim that the cube is red?', criteria: { supports: 'The document supports the claim.', contradicts: 'The document contradicts the claim.', insufficient: 'The document does not provide enough evidence.' } },
      },
    } }, undefined, { timeout: 120000 });
    if (response.isError) throw new Error(response.content[0].text);
    const data = JSON.parse(response.content[0].text);
    assert.equal(data.answers.colour.choice, 'blue');
    assert.equal(data.answers.false_claim.choice, 'contradicts');
    console.log(JSON.stringify({ jev_live_test: 'PASS', ...data }, null, 2));
  } else if (!process.argv.includes('--local-only')) {
    const response = await client.callTool({ name: 'delegate_task', arguments: {
      task: 'Return exactly three lines: alpha, beta, gamma, in that order. No heading or explanation.',
      context: 'This is a connection test with synthetic data.', files: [],
      review_checks: ['The result contains alpha, beta and gamma in that order and contains no additional substantive content.'],
    } }, undefined, { timeout: 300000 });
    if (response.isError) throw new Error(response.content[0].text);
    const data = JSON.parse(response.content[0].text);
    assert.equal(data.preview.trim(), 'alpha\nbeta\ngamma');
    assert.equal(data.verdict, 'checks_passed');
    assert.ok(data.review?.model);
    console.log(JSON.stringify({ live_test: 'PASS', ...data }, null, 2));
  }
} finally { await client.close(); }
