# Preparing and Publishing to GitHub

[English](PUBLISHING.md) | [Русский](PUBLISHING.ru.md)

Publish from a clean directory of this repository. Do not publish from an active working tree that may contain credentials, runtime artifacts, or local settings. The `node_modules`, `.secrets`, `.runtime`, and `results` directories, local `settings.json`, and backup files are excluded from publication.

`public-files.json` defines the explicit list of files permitted for distribution. When adding a new public file, update this manifest. It also serves as the file list when packaging a clean archive.

## Pre-Publish Verification

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
node smoke.mjs --local-only
npm.cmd run check:public
```

The public release checker scans for credential formats, private home paths, and personal email addresses, verifying staged assets against `public-files.json`. If a `.git` repository exists, it checks the index, including force-added files and staged file contents. Findings are reported by category without exposing detected strings. Note that the scanner does not inspect historical Git commits; perform a manual review of all files prior to publication.

## Initializing a New Repository

Start a new Git repository from the clean export, then review the staged files. These commands do not publish anything:

```powershell
git init -b main
git add .
npm.cmd run check:public
git diff --cached --stat
git diff --cached
```

Verify Git commit author details before committing: the configured name and email address will appear in public commit logs. If anonymity is required, configure a pseudonym and a GitHub noreply email address from your account settings before proceeding.

Create the initial commit:

```powershell
git commit -m "Initial public release"
```

Create an empty repository on GitHub without default files. Replace `REPOSITORY_URL` with its HTTPS URL. The `git push` command below publishes the source:

```powershell
git remote add origin REPOSITORY_URL
git push -u origin main
```

Alternatively, upload the clean distribution files directly via the GitHub web interface, ensuring dotfiles including `.github/workflows/ci.yml` are included.

## Offline CI Workflows and Licensing

Do not configure Google credentials or TypeSafe API keys in GitHub Actions secrets. The GitHub Actions workflow installs npm dependencies and runs `npm test`, `node smoke.mjs --local-only` and `npm run check:public`, without calling Gemini or Jev. Successful workflow completion does not indicate live model availability or validate quota access.

The [MIT license](../LICENSE) is included in the repository.
