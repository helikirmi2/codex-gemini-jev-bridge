# Guide for Another GPT / Codex Assistant

[English](FOR_GPT.md) | [Русский](FOR_GPT.ru.md)

This guide provides execution context to a new assistant without requiring previous conversation history, author credentials, or private local paths.

## Ready-to-Use Prompt

Copy and paste this prompt into a new session alongside this repository or access to its local directory:

> Assist with installing and operating the Gemini + Jev Bridge from this repository. Review README.md, docs/USER_GUIDE.md, docs/FOR_GPT.md, and AGENTS.md. Inspect available local tools and current configurations before performing authorized actions. Gemini access specifically uses the Google AI Pro subscription's included Antigravity CLI quota with useG1Credits=false, no Gemini API backend, no overage credits/purchases, and no automatic paid fallback. Jev requires a separate TypeSafe account, key, and quota; do not request or paste secrets in chat. Delegate substantive draft generation to Gemini, use Jev for targeted evaluation and classification, and retain planning, applying changes, test execution, and final user-facing responses in Codex. Preview exact changes before applying installation steps, especially global Antigravity CLI profile restrictions. If local host execution access is unavailable, provide instructions and explicitly state that no local commands were run.

## Environment Discovery

A web chat interface without local filesystem or MCP access cannot run this stdio server or execute commands on the user's host. Do not claim to run local commands. Do not expose this local stdio server as a public HTTP service to circumvent environment boundaries.

In Codex or another local MCP environment, check for `gemini-jev` tools. If available, invoke `bridge_status` first. Do not re-run installation simply because this is a new conversation. `bridge_status` inspects local configuration presence; it does not validate TypeSafe key authenticity, Google sign-in status, or remaining quota.

## Clean Installation Workflow

1. Inspect project permissions, local instructions, Node.js 22+, npm, and the Antigravity CLI. Reference official documentation linked in README when necessary.
2. Run `npm ci --ignore-scripts` and `node setup.mjs`. On Windows systems where `npm.ps1` execution is restricted, use `npm.cmd`.
3. Configure local `settings.json`. Do not copy paths from examples. Run `agy models` and select an available Gemini Flash model present in the account. Restrict `sourceRoots` to necessary project directories. Store the TypeSafe key in `.secrets/TYPESAFE_API_KEY` or an environment variable.
4. Google account authentication requires manual user sign-in in the CLI. Do not extract OAuth tokens, session cookies, or passwords, and do not print keys to logs.
5. Run offline tests: `npm test` and `node smoke.mjs --local-only`.
6. Generate an installation plan using `node install.mjs`. Note that `--apply` modifies Codex configuration files and **alters the global Antigravity CLI profile**, imposing tool restrictions across all CLI sessions. Respect existing user permissions granted for setup without prompting repeatedly for identical approval.
7. After applying the plan and restarting the client, run a single live verification if calls to the services and use of their quotas are already authorized. Clearly distinguish which checks ran locally and which contacted remote endpoints. Do not present cached test runs as current status.

## Task Delegation

For `delegate_task`, provide a self-contained task description, minimal necessary context, explicitly selected absolute file paths, and 1–6 verifiable review criteria. Example arguments without files:

```json
{
  "task": "Draft concise reference documentation for the provided function definitions.",
  "context": "The normalizeLabel function trims leading and trailing whitespace; empty input returns an empty string. The countLabels function counts non-empty lines after normalization.",
  "files": [],
  "review_checks": [
    "Documentation covers both provided functions.",
    "No unverified functions or promises of automated testing are introduced."
  ]
}
```

The tool returns `result_file`, a brief `preview`, `verdict`, Jev ratings, and Gemini usage statistics. Read only relevant sections of the generated result file. Drafts and patches represent untrusted input; inspect and apply changes using standard local tools in compliance with repository guidelines, and run test suites.

For `jev_evaluate`, batch independent targeted questions into a single request. For `choice`, provide at least two valid options and an explicit fallback option for insufficient evidence where applicable. Use `noul` to estimate assertion probability and `score` for ordered ordinal scales; these types are not interchangeable. Example:

```json
{
  "context": "Source specification: only CSV reading is supported. Draft: the application also edits XLSX files.",
  "files": [],
  "questions": {
    "support": {
      "type": "choice",
      "instructions": "Does the source specification support the draft's claim that XLSX editing is supported?",
      "criteria": {
        "supported": "The claim is explicitly confirmed.",
        "contradicted": "The source specification contradicts the claim.",
        "insufficient": "There is insufficient evidence to verify the claim."
      }
    }
  }
}
```

## Essential Constraints

- Jev numerical evaluations and ratings are advisory. A `checks_passed` status does not grant authorization to publish, delete, deploy, or merge changes.
- When the tool returns `needs_codex_review`, a service error, or insufficient evidence, review the artifacts directly in Codex. Never claim output was verified by Jev if verification did not succeed.
- Do not delegate trivial shell operations or duplicate identical generation tasks across multiple models. Use deterministic local scripts for repetitive automation.
- Do not transmit API keys, credential stores, unrelated personal information, or raw log bundles. While `.gitignore` protects against accidental tracking, it does not sanitize text payloads or selected files.
- If an authentication failure or quota limit occurs, report it once. Halt calls to that service until resolved; proceed with useful offline work using available local tools.
- Gemini access specifically uses the Google AI Pro subscription's included Antigravity CLI quota with `useG1Credits=false`, no Gemini API backend, no overage credits/purchases, and no automatic paid fallback. Never enable credit purchases or configure a Gemini API key to bypass tests.
- In final responses, summarize actual modifications and verified test executions. Do not promise fixed quota reductions.
