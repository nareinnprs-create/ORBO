# Support

Support is best-effort through GitHub issues. There is no service-level
agreement and no guaranteed response time.

## Where to ask

Open a GitHub issue using the bug report or feature request template. See
[CONTRIBUTING](../CONTRIBUTING.md) for how pull requests are reviewed; review
and merge belong to the owners named in `.github/CODEOWNERS`.

## What to include

- Deployment type (local dev, single-container image, Helm chart, desktop
  app, or platform deploy).
- Version: root `package.json` version, or `build-version.json` for desktop
  builds.
- For bugs: steps to reproduce, what you expected, and what happened instead.
- Redacted logs or error output.

## What to redact

Never paste secrets or keys: no `.env` values, `KEY_ENCRYPTION_KEY`, tokens,
OAuth secrets, API keys, credentials, customer data, or transcripts. Keep
secrets out of issues the same way they stay out of source control.
