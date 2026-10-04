# Data and security boundaries

The bridge runs locally over stdio. It sends selected task text and files to Google through Antigravity CLI and to TypeSafe through its HTTPS API. Those providers' account settings and terms apply. The bridge is not an anonymization service for arbitrary task contents.

Credentials stay in the local OS login store, a local TypeSafe key file, or the process environment. Keep credential files outside public source roots where possible. The bridge rejects common credential filenames and configuration directories and redacts its configured TypeSafe key; these checks cannot detect every embedded secret. Inspect selected files and prompts before sending them.

Git ignores local settings, secrets, runtime state, logs, results and backups. Ignore rules do not remove a file already tracked by Git. The public-file scanner checks the publication allowlist and common leak patterns; it is a heuristic, not proof that all private data has been removed. It does not rewrite or inspect old commit history. Start a new repository from the clean export, and review changes before each publication.

Generated patches and Jev judgments are untrusted. Review changes and run tests before applying consequential actions. No score grants permission to publish, merge or deploy.

Antigravity CLI restrictions are installed in its global CLI profile. They also affect manual CLI sessions. The bridge checks billing restrictions before each launch; it does not control later edits by other applications or future changes in provider behavior. Keep the CLI current and review its official documentation when upgrading.

Backups of user configuration may contain sensitive information and must remain local. If a secret is accidentally published, revoke/rotate it with its provider; simply deleting the visible file does not erase Git history.

For a vulnerability involving secrets, avoid posting keys, account identifiers, private logs or credential files in a public issue. Use a private reporting channel offered by the repository owner, if available, or publish only a redacted description with synthetic reproduction data.
