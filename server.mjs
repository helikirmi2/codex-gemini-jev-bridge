import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { delegate, evaluate, sourceFiles, status, redact } from './core.mjs';

const server = new McpServer({ name: 'gemini-jev', version: '1.0.0' }, {
  instructions: 'Delegate substantial routine drafting, code proposals and document analysis to delegate_task. Supply explicit files and 1-6 narrow review_checks for Jev. Results are advisory: Codex handles integration, tests and uncertain checks. Use jev_evaluate for compact routing, classification or checks on Codex/Gemini output. Do not duplicate completed work or send secrets. Prefer scripts for deterministic tasks.',
});
const text = z.string().max(100_000);
const files = z.array(z.string().max(2000)).max(20).default([]);
const question = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), instructions: text, criteria: z.record(z.string(), z.string().max(4000).nullable()) }),
  z.object({ type: z.literal('noul'), instructions: text, criteria: z.object({ true: text, false: text }).optional() }),
  z.object({ type: z.literal('score'), instructions: text, criteria: z.array(z.string().max(4000)).min(2).max(10) }),
]);
const wrap = fn => async args => {
  try { return { content: [{ type: 'text', text: JSON.stringify(await fn(args)) }] }; }
  catch (error) { return { isError: true, content: [{ type: 'text', text: redact(error.message) }] }; }
};

server.registerTool('bridge_status', {
  description: 'Check local Gemini/Jev integration readiness without making paid requests or returning credentials.',
  inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false },
}, wrap(status));

server.registerTool('delegate_task', {
  description: 'Send one self-contained routine task to Gemini Flash, then batch-check its result with Jev. Supply selected absolute file paths and explicit acceptance criteria. Returns a short preview, full result file and review verdict. Cannot change source files, browse or execute commands. Uses Google quota and TypeSafe API credits.',
  inputSchema: { task: text.min(1), context: text.default(''), files, review_checks: z.array(z.string().min(1).max(2000)).min(1).max(6) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, wrap(delegate));

server.registerTool('jev_evaluate', {
  description: 'Ask Jev 1-12 narrow typed questions for routing, ranking or evidence checks on Codex/Gemini results. Supply context as text/JSON plus optional selected files. Confidence is advisory, not proof or authorization. Repeated identical evaluations are cached in this server process. Uses TypeSafe API credits.',
  inputSchema: { context: text.min(1), files, questions: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), question) },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, wrap(async ({ context, files, questions }) => {
  const count = Object.keys(questions).length;
  if (count < 1 || count > 12) throw new Error('Provide 1-12 questions per evaluation.');
  for (const q of Object.values(questions)) {
    if (q.type === 'choice' && (Object.keys(q.criteria).length < 2 || Object.keys(q.criteria).length > 32)) throw new Error('Choice questions require 2-32 options.');
  }
  return evaluate({ context, sources: await sourceFiles(files) }, questions);
}));

await server.connect(new StdioServerTransport());
