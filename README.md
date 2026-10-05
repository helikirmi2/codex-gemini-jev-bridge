# Gemini + Jev Bridge for Codex

[English](README.md) | [Русский](README.ru.md)

A local MCP server that lets Codex delegate substantial routine drafting, analysis and code proposals to Gemini. TypeSafe Jev checks the draft against explicit criteria. Codex plans the work, reviews and applies changes, runs tests and gives the final answer.

**Gemini uses the included quota of a Google AI Pro subscription through Antigravity CLI.** The bridge requires `useG1Credits=false`: when quota runs out, Gemini work stops until it resets. It does not use a Gemini API key, API billing, credit overages or a paid fallback. Model availability and limits depend on the signed-in Google account and [Google's current plan terms](https://www.antigravity.google/docs/plans).

**Jev uses a separate TypeSafe account, API key and quota.** It is not included in Google AI Pro. This is an independent project, unaffiliated with Google, OpenAI or TypeSafe.

## EN/RU guides

| Guide | English | Русский |
| --- | --- | --- |
| Installation, usage and troubleshooting | [User guide](docs/USER_GUIDE.md) | [Инструкция пользователя](docs/USER_GUIDE.ru.md) |
| Setup prompt and instructions for another GPT/Codex chat | [GPT guide](docs/FOR_GPT.md) | [Инструкция для GPT](docs/FOR_GPT.ru.md) |
| Preparing and publishing a clean source export | [Publishing guide](docs/PUBLISHING.md) | [Публикация](docs/PUBLISHING.ru.md) |

## Quick start

You need Node.js 22+, npm, Codex with local MCP support, [Antigravity CLI](https://www.antigravity.google/docs/cli/install/) signed in to your Google AI Pro account, and a TypeSafe key. These instructions use Windows/PowerShell; live service access on macOS/Linux has not been verified for this release.

In the repository folder:

```powershell
npm.cmd ci --ignore-scripts
node setup.mjs
```

Edit the generated `settings.json`: select an available Gemini Flash model from `agy models`, set the CLI path and allow only the project folders you need in `sourceRoots`. Store the TypeSafe key separately in `.secrets/TYPESAFE_API_KEY`. Then:

```powershell
npm.cmd test
node smoke.mjs --local-only
node install.mjs
```

Review the installation plan before applying it:

```powershell
node install.mjs --apply
```

The installer registers the MCP server, adds delegation rules and restricts the **global Antigravity CLI profile**, including manual CLI sessions. It backs up existing files. See the [user guide](docs/USER_GUIDE.md) for the exact changes and removal steps, then restart Codex.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `delegate_task` | Gemini drafts text or a patch; Jev checks 1–6 criteria; results are saved locally |
| `jev_evaluate` | Up to 12 compact routing, ranking or evidence questions per request |
| `bridge_status` | Local configuration status without contacting the services |

Only task text and explicitly selected files are sent to the providers. Credentials, local settings and generated results stay out of Git. Read the [data boundaries](SECURITY.md) and [delegation rules](docs/DELEGATION.md) before selecting files. Jev scores are advisory; they do not replace review or tests. Delegation still uses Codex for task setup and review, so it does not guarantee a fixed quota saving.

## Verification

```powershell
npm.cmd test
npm.cmd run check:public
```

These checks and `node smoke.mjs --local-only` do not call Gemini or Jev. A live `node smoke.mjs` call uses their quotas and requires completed setup. Passing offline checks does not confirm account access or remaining quota.

## License

[MIT](LICENSE). Dependencies retain their own licenses.
