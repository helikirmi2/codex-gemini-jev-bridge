## Gemini and Jev delegation

Use the gemini-jev MCP server for authorized routine delegation when available. Keep the primary assistant responsible for planning, complex reasoning, integration, execution tests and the final answer.

- Use delegate_task for substantial, self-contained drafting, analysis, extraction and code proposals. Supply only necessary context, explicitly selected files, and 1-6 narrow acceptance criteria in review_checks. The tool runs Gemini followed by Jev.
- Prefer source_selections with inclusive 1-based line ranges over whole files. Source indices follow files first, then source_selections. Use a short review_context and one review_evidence entry per check to send only relevant evidence to Jev. Omitted evidence preserves whole-source review; an explicit empty source_indices array supplies no source evidence.
- Keep response_mode=compact unless detailed ratings are needed. Full drafts and metadata remain in local artifact files. Exact successful requests are cached in memory for 10 minutes; cached/coalesced results have no new provider usage. Do not describe original cached usage as newly consumed quota.
- Gemini returns a draft or patch; the primary assistant reviews, applies and tests changes using normal tools. The bridge does not apply proposals to project sources or execute proposed commands.
- Use jev_evaluate for compact routing, ranking and evidence checks on either assistant's work. Batch independent questions. Scores are advisory, never proof, user authorization or a replacement for tests.
- A failed, uncertain or unavailable check requires primary-assistant review. Do not claim a check occurred if the service failed or evidence was missing.
- Prefer scripts for deterministic operations. Avoid trivial delegations, duplicate full tasks, and reading entire result files when relevant excerpts suffice.
- Never send API keys, authentication files or unrelated private data. Keep raw logs and large outputs local; return short reports and artifact paths.
- If a service is unavailable, report that once and continue useful authorized work. Do not repeatedly retry known authentication or quota failures.
- Delegate only work authorized by the user. Existing instructions, access restrictions and approval boundaries still apply. Do not merge, deploy, publish or delete based on Jev scores.
- Gemini must use the included Google AI Pro subscription quota through Antigravity CLI only. Keep useG1Credits=false. Never use Gemini API keys, API billing, purchased credits or an automatic paid fallback. Stop Gemini calls when quota is exhausted until it resets.

Source roots are configured in ignored local settings.json. Key values belong only in local credential files or the process environment and must never be printed or copied into prompts or configuration.
