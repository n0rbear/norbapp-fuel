# Security Policy

## Reporting a Vulnerability

Do not report security vulnerabilities through public GitHub issues.

Until an official security contact is published, contact the maintainer through a private channel and include enough detail to reproduce and evaluate the issue.

## API Keys and Secrets

API keys, NDP ingest keys, signing keys, tokens, passwords, `.env` files, `local.properties`, keystores, APKs, and AABs must not be committed to the repository.

If an API key or other secret is exposed, it must be treated as compromised and rotated before any public release.

## Built APKs

Keys included in an Android APK are not secret. Any API key used by the app must be restricted by provider-side controls such as Android package name, signing certificate fingerprint, enabled APIs, quotas, and monitoring.

NDP ingest keys configured through `BuildConfig` are also extractable from APKs. Use local development keys only. For production or shared builds, prefer short-lived registration credentials or a backend proxy.

## Telemetry Privacy

NDP telemetry must not include exact GPS coordinates, route addresses, raw third-party API responses, authorization headers, API keys, tokens, emails, phone numbers, usernames, advertising IDs, or full stack traces. Query strings are stripped from API telemetry and payload fields with sensitive names are removed before serialization.

## Secret Scanning

Run secret scanning before commits, releases, and publication. Review findings manually because documentation may contain safe placeholder names such as `API_KEY`.
