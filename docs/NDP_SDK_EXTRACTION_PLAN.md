# NDP SDK Extraction Plan

## 1. Current Fuel-Specific Components

- `MainActivity`, `MainScreen`, `MainViewModel`, and `FuelRepository` decide when Fuel business events happen.
- Fuel-specific operations are `trip_calculation`, `fuel_search`, and `location`.
- Fuel-specific payload categories include route availability, fuel provider, fuel type, station count, result category, and location accuracy category.
- Build configuration currently reads Fuel-local `BuildConfig` fields.

These parts should stay in the Fuel app until the event schema is stable across more apps.

## 2. App-Neutral Components

- `NdpEvent`
- `NdpSeverity`
- `NdpSession`
- `NdpOperationContext`
- `NdpClient`
- `NdpTransport`
- `NdpTransportResult`
- `NdpHttpStatusPolicy`
- `HttpNdpTransport`
- `NdpJson`
- `NdpSanitizer`
- `NdpLog`
- `NdpTime`

These are candidates for a shared SDK after another app validates the same contracts.

## 3. Proposed Future Gradle Module Structure

```text
:ndp-diagnostics-core
  Event model, session, operation context, sanitizer, logger, JSON contract.

:ndp-diagnostics-transport-http
  HttpURLConnection or OkHttp transport implementation.

:ndp-diagnostics-test-fixtures
  Recording transport, manual scheduler, sample events, sanitizer assertions.

:app
  Fuel-specific event mapping and UI/ViewModel integration.
```

Do not create these modules in the current hardening pass.

## 4. Public API

The future public API should stay small:

- `NdpDiagnostics.track(event)`
- `NdpDiagnostics.startOperation(name)`
- `NdpDiagnostics.flush()`
- `NdpDiagnostics.shutdown()`
- `NdpEvent`
- `NdpConfig`
- `NdpEventFactory` or app-owned event builders

The SDK should not expose queue internals, auth circuit internals, transport request bodies, or credentials.

## 5. Event Schema Model

The shared schema should define:

- `traceId`
- `eventType`
- `source`
- `severity`
- `title`
- optional `description`
- sanitized `payload`
- `runtimeVersion`
- `timestamp`

Apps should own their event catalogs and keep names centrally defined. The SDK can validate the syntax but should not own app-specific event names.

## 6. Transport Abstraction

The transport contract should return typed results:

- `Accepted`
- `RetryableFailure`
- `PermanentFailure`
- `AuthenticationFailure`

The HTTP implementation should own status-code classification, timeout handling, `Retry-After` parsing, stream closing, and disconnect behavior.

## 7. Privacy Contract

The SDK must document that apps must not send:

- exact coordinates
- addresses
- raw provider responses
- authorization headers
- API keys
- ingest keys
- emails
- phone numbers
- usernames
- full stack traces
- URL query strings

The sanitizer is a safety layer, not permission to send unsafe data.

## 8. Logging Policy

The SDK should default to no logging in release builds. Debug logging must be configurable and must route through the sanitizer. Logs may include event type, trace ID, status code, result category, retry delay, and sanitized exception type/message. Logs must not include credentials, full payloads, full response bodies, query strings, or stack traces.

## 9. Reusable Test Fixtures

Move these patterns into reusable fixtures later:

- manual scheduler
- immediate scheduler
- recording transport
- sequence transport
- throwing transport
- sample event factory
- status policy matrix
- sanitizer matrix
- queue retry tests

## 10. Driver Assistant Migration Plan

1. Keep Driver Assistant app-specific event names in that app.
2. Replace its local transport with the shared typed transport.
3. Map existing trace IDs to `NdpOperationContext`.
4. Keep Android UI free of transport and credential details.
5. Validate terminal events for each Driver Assistant workflow.

## 11. Keto App Migration Plan

1. Define app-specific operations such as meal logging, macro calculation, and sync.
2. Use shared session and operation trace model.
3. Keep food input details privacy-limited.
4. Add app-specific sanitizer tests for nutrition text fields.
5. Validate no health-sensitive free-text payloads are sent.

## 12. Baby Monitor Migration Plan

1. Define operations around monitor session start, stream health, alert flow, and reconnect.
2. Do not send audio, video, device identifiers, room names, or child-related personal data.
3. Treat telemetry as highly privacy-sensitive.
4. Prefer coarse status categories over raw sensor data.
5. Add stricter app-level privacy tests before enabling NDP.

## 13. Versioning and Backward Compatibility

- Use semantic versioning for the SDK.
- Keep event JSON backward compatible where possible.
- Add schema version metadata before public SDK release.
- Deprecate fields before removal.
- Keep transport result semantics stable.
- Provide migration notes for app event catalogs.

## 14. Do Not Extract Yet

Do not extract these now:

- Fuel-specific event names.
- Fuel-specific payload builders.
- ViewModel integration points.
- App lifecycle wiring.
- BuildConfig field names.
- Any durable queue implementation.
- Production credential provisioning.

The current priority is hardening the Fuel reference integration before generalizing it.
