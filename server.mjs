import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { delegate, evaluate, sourceFiles, status, redact } from './core.mjs';

const server = new McpServer({ name: 'gemini-jev', version: '1.1.0' }, {
  instructions: 'Delegate substantial routine drafting, code proposals and document analysis to delegate_task. Supply explicit files and 1-6 narrow review_checks for Jev. Results are advisory: Codex handles integration, tests and uncertain checks. Use jev_evaluate for compact routing, classification or checks on Codex/Gemini output. Do not duplicate completed work or send secrets. Prefer scripts for deterministic tasks.',
});
const text = z.string().max(100_000);
const files = z.array(z.string().max(2000)).max(20).default([]);
const selections = z.array(z.object({ path: z.string().max(2000), start_line: z.number().int().positive(), end_line: z.number().int().positive() }).strict()).max(20).default([]);
const evidence = z.array(z.object({ source_indices: z.array(z.number().int().nonnegative()).max(20), context: text.optional() }).strict()).max(6).optional();
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
  description: 'Send one routine task to Gemini, then check its draft with Jev. Prefer source_selections with inclusive 1-based line ranges and narrow review_context/review_evidence. Source indices follow files first, then source_selections. Exact successful Gemini and Jev requests are cached in memory for 10 minutes. Default compact response links to full artifacts and reports actual usage/timing. Cannot edit sources or execute commands. Gemini uses included Google AI Pro quota only; Jev uses separate TypeSafe quota.',
  inputSchema: { task: text.min(1), context: text.default(''), files, source_selections: selections, review_checks: z.array(z.string().min(1).max(2000)).min(1).max(6), review_context: text.optional(), review_evidence: evidence, response_mode: z.enum(['compact', 'full']).default('compact') },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, wrap(delegate));

server.registerTool('jev_evaluate', {
  description: 'Ask Jev 1-12 narrow typed questions for routing, ranking or evidence checks. Supply context and selected files or inclusive 1-based source_selections. Confidence is advisory, not proof or authorization. Identical evaluations are cached for 10 minutes in this process. current_usage is null and provider_calls is zero on a cache hit. Uses separate TypeSafe quota.',
  inputSchema: { context: text.min(1), files, source_selections: selections, questions: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), question) },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, wrap(async ({ context, files, source_selections, questions }) => {
  const count = Object.keys(questions).length;
  if (count < 1 || count > 12) throw new Error('Provide 1-12 questions per evaluation.');
  for (const q of Object.values(questions)) {
    if (q.type === 'choice' && (Object.keys(q.criteria).length < 2 || Object.keys(q.criteria).length > 32)) throw new Error('Choice questions require 2-32 options.');
  }
  return evaluate({ context, sources: await sourceFiles(files, undefined, source_selections) }, questions);
}));

await server.connect(new StdioServerTransport());
