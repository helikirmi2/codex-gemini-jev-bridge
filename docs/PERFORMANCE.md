# Performance options

[English](PERFORMANCE.md) | [Русский](PERFORMANCE.ru.md)

Version 1.1 reduces repeated context and provider calls. It keeps Gemini on the included Google AI Pro quota through Antigravity CLI with `useG1Credits=false`. Jev still uses separate TypeSafe quota. Codex reviews and tests drafts.

## Select only relevant lines

Both `delegate_task` and `jev_evaluate` accept `source_selections`:

```json
{
  "source_selections": [
    { "path": "C:/projects/example/src/parser.mjs", "start_line": 20, "end_line": 60 }
  ]
}
```

Replace the example path with an absolute path inside configured `sourceRoots`. Lines are inclusive and numbered from 1. Each fragment includes its original file path and line range. A trailing newline does not create an extra line. Invalid ranges and ranges beyond EOF are rejected, never truncated. Ranges do not bypass credential, canonical-path, binary or size checks.

Legacy `files` still selects whole files. You can combine different whole files and fragments; selecting the same canonical file both ways is rejected. Identical duplicate selections are rejected; different ranges of the same file are allowed. Source indices are zero-based: `files` entries first, followed by `source_selections` in supplied order. There are at most 20 selections, 200 KB per original file, 600 KB across unique original files, and 600 KB of selected text. Multiple ranges of one file are read from one snapshot per request.

## Give Jev focused evidence

`review_context` replaces drafting context for Jev only. If omitted, Jev receives the original `context`. `review_evidence` must have one entry per `review_checks` item:

```json
{
  "task": "Propose a short explanation of the selected parser function.",
  "context": "Draft an explanation for a developer.",
  "source_selections": [
    { "path": "C:/projects/example/src/parser.mjs", "start_line": 20, "end_line": 60 }
  ],
  "review_checks": ["Every described branch is supported by the selected source."],
  "review_context": "Check factual support; do not claim tests were executed.",
  "review_evidence": [{ "source_indices": [0], "context": "Only this fragment supports the criterion." }],
  "response_mode": "compact"
}
```

Shared evidence is transmitted once, with a map from each criterion to its source indices and optional context. Unreferenced sources are omitted from the review payload. An explicit empty `source_indices` array supplies no source evidence; omitting `review_evidence` supplies all selected sources to every criterion. Invalid indices/counts fail before Gemini is called. All criteria share the task, draft and global review context. Scoping is expressed in Jev instructions, not a security boundary between questions. Missing evidence or an unavailable check still requires Codex review.

## Cache and concurrent calls

Successful exact Gemini requests are cached in this MCP server process for 10 minutes, up to 20 entries. The key includes prompt, selected contents/ranges/paths, model, CLI entry, instructions and enforced policy. Jev exact evaluations have the same fixed TTL and up to 100 entries. Each cache has a 2 MB serialized-result budget; entries are evicted oldest first. Expiration is not extended by access. Caches are memory-only, disappear on restart and do not store failures.

The current subscription/profile gate is checked on every Gemini call, including cache hits. Identical concurrent Gemini tasks share one execution; distinct concurrent tasks return a busy error. There is no automatic queue, paid fallback or persistent conversation reuse. Authentication/quota failures must not be repeatedly retried.

Antigravity uses [sparse settings persistence](https://www.antigravity.google/docs/settings?tab=cli), which can omit default-valued settings. After its own CLI execution the bridge restores an omitted explicit `useG1Credits=false`, preserving current unrelated settings. It refuses explicit enabled credits or changed providers/permissions. A missing flag before a new execution still blocks Gemini; restore it through the installer. The profile remains global, affecting manual CLI sessions too.

## Compact output and measurements

The default `response_mode=compact` returns a 400-character preview, verdict, per-check choice/confidence, provider usage and timing/byte metrics. `result_file` contains the full draft and `metadata_file` the full review, including probabilities and original usage. `response_mode=full` returns the detailed report with a 1,600-character preview. Older consumers needing detailed fields should request `full`.

`cached` and `coalesced` distinguish reuse. Reused Gemini output has `provider_calls=0`, `current_usage=null` and its original statistics under `original_usage`. Jev cache hits likewise have zero provider calls and no current usage; the full report retains historical `usage`. Unknown provider-call counts after errors are reported as `null`. Never describe historical tokens as newly consumed quota.

`metrics` reports preparation, generation and review times, source bytes, review source/state bytes, result bytes and returned JSON size excluding the size field itself. Times end after review/draft persistence, before the final metadata write. Review-state size excludes question instructions and HTTP overhead. These measurements describe this request, not exact Google quota percentages. `npm test` verifies these behaviors offline. The optional live `node smoke.mjs` verifies a first Gemini/Jev request and an identical cached request in one process, using synthetic data; only the first should call providers.
