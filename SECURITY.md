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

NDP release logging is disabled by default. Debug logging is local-only and must pass through the central sanitizer. Logs must not include ingest keys, authorization headers, full payloads, full response bodies, URL query strings, or raw throwable stack traces. Only sanitized exception type and message are allowed.

The sanitizer masks known credential and privacy patterns such as Bearer and Basic authorization values, API-key-like values, Google `AIza` keys, NDP ingest keys, email addresses, phone-like values, precise coordinates, Windows paths, URL query strings, and long token-like strings. It is intentionally conservative but not a formal data-loss-prevention system. Do not rely on it to make unsafe payloads safe.

NDP delivery uses a bounded in-memory queue. It has capped retry and backoff behavior, but it is not durable storage. Process death can lose queued events and the app does not provide guaranteed telemetry delivery.

## Secret Scanning

Run secret scanning before commits, releases, and publication. Review findings manually because documentation may contain safe placeholder names such as `API_KEY`.
