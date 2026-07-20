# NDP Integration

## Goal

NorbApp Fuel integrates with Norb Diagnostic Platform (NDP) so that local debug builds can be registered and observed through the existing NDP timeline, correlation engine, and AI export flow.

## Architecture

Fuel uses a small Android diagnostics layer in `com.example.tikltsg.diagnostics`. The layer follows the existing NDP Android ingest contract:

- `POST /api/ingest/events`
- Header: `X-NDP-Ingest-Key`
- Event source: `ANDROID`

The client is asynchronous, uses a bounded in-memory queue, short network timeout, and limited retries. NDP errors are swallowed inside the diagnostics layer and never propagate into trip calculation or fuel search logic.

The diagnostics package is still app-local. It is shaped so the app-neutral parts can later move into a shared NorbApp Diagnostics SDK, but no separate SDK module exists in this repository.

## Configuration

Telemetry is disabled unless all required local values are present:

```properties
NDP_ENABLED=false
NDP_INGEST_ENDPOINT=http://10.0.2.2:4000/api/ingest/events
NDP_INGEST_KEY=
NDP_ENVIRONMENT=development
```

These values are read through the existing `local.properties` to `BuildConfig` pattern. `local.properties` is not committed. `BuildConfig` does not encrypt secrets, so long-lived NDP credentials should not be used in distributed builds.

## Event Types

- `app.started`
- `app.foregrounded`
- `app.backgrounded`
- `screen.main.opened`
- `trip_calculation.requested`
- `trip_calculation.started`
- `trip_calculation.succeeded`
- `trip_calculation.failed`
- `trip_calculation.validation_failed`
- `fuel_search.requested`
- `fuel_search.started`
- `fuel_search.succeeded`
- `fuel_search.failed`
- `location.requested`
- `location.permission_denied`
- `location.started`
- `location.succeeded`
- `location.unavailable`
- `location.timed_out`
- `location.failed`
- `api.request.started`
- `api.request.succeeded`
- `api.request.failed`
- `error.caught`
- `waypoint.added`
- `waypoint.removed`
- `fuel_type.changed`
- `round_trip.changed`
- `station.selected`

All names are defined centrally in `NdpEventNames`. Business events use dot notation with operation scopes such as `trip_calculation.*`, `fuel_search.*`, `location.*`, and `api.request.*`. Do not add free-form event strings outside the central definitions.

## Trace Model

NDP uses separate concepts for session and operation continuity:

- The app owns one `NdpSession` for the process lifetime. Serialized events include `ndpSessionId` in the payload.
- Each business operation gets one operation trace ID from `NdpOperationContext`.
- Trip calculation keeps `trip_calculation.requested`, `trip_calculation.started`, and exactly one terminal calculation result in the same trace.
- Fuel search keeps `fuel_search.*` and nested `api.request.*` events in the same trace when it is part of the same operation.
- Location keeps `location.requested`, `location.started`, and terminal location results in the same trace.
- Separate user operations must create separate operation trace IDs.

Terminal events are required for validation failures, route unavailable cases, exceptions, permission denial, null location, timeout, unavailable provider, and success.

## Transport Result and HTTP Policy

`NdpTransport.send` returns a typed `NdpTransportResult`, not a boolean:

- `Accepted(statusCode)` for HTTP 200-299.
- `PermanentFailure(statusCode, reason)` for 400, 404, 409, and other non-retryable client errors.
- `AuthenticationFailure(statusCode)` for 401 and 403.
- `RetryableFailure(statusCode, retryAfterMs, causeType)` for 408, 429, 500, 502, 503, 504, I/O failures, and timeouts.

`Retry-After` is parsed only as seconds and accepted only within a bounded range. Excessive or malformed values are ignored and normal capped backoff is used.

## Retry and Queue Policy

The client uses a bounded in-memory FIFO queue. Successful events are removed. Permanent failures are dropped. Retryable failures are requeued at the front until the maximum retry count is reached. A single flush runs at a time, and automatic retry is scheduled without requiring a new event.

Backoff is exponential with jitter, capped by `maxBackoffMillis`. The default policy uses:

- `maxRetries`: 5
- `initialBackoffMillis`: 1000
- `maxBackoffMillis`: 30000

After 401 or 403, the auth circuit breaker opens, the current queue is cleared, and future telemetry is dropped for the process. Business actions continue normally.

The queue is not persisted to disk. Process death can lose queued events. NDP telemetry has at-most-best-effort delivery, not guaranteed delivery.

## Data Sent to NDP

Allowed telemetry includes:

- event type, title, severity, timestamp, trace ID, session ID
- app version, build number, environment
- boolean input presence flags
- duration in milliseconds
- result category
- fuel provider name
- `locationAvailable: true`
- result count
- sanitized API host and path
- HTTP method
- optional status code when safely available
- exception type and sanitized message

## Data Not Sent to NDP

The integration does not send:

- Google Maps API key
- Tankerkoenig API key
- NDP ingest key
- authorization headers
- exact GPS coordinates
- start address or destination address
- full route
- raw Google Places or fuel-provider response
- user name, email, phone number, advertising ID
- full stack traces
- URL query strings

## Failure Isolation

If NDP is disabled, misconfigured, offline, slow, or returns an error, the app continues normally. Events may be dropped after the configured retry limit. Diagnostics never block the main thread and never throw into the business layer.

HTTP resources are closed after every send attempt. The transport closes output, response, and error streams where available, sets connect and read timeouts, and disconnects the `HttpURLConnection`.

## Logging and Sanitization

Release logging is disabled by default. Debug logging is configurable through `NDP_LOGGING_ENABLED` and uses `NdpLog`.

Logs must not include:

- ingest keys
- authorization headers
- full payloads
- full response bodies
- URL query strings
- raw stack traces

Only sanitized exception type and message may be logged.

The sanitizer removes or masks common Bearer, Basic, API key, Google `AIza`, NDP ingest key, email, phone-like, precise coordinate, URL query, Windows path, and long token-like patterns. It also drops payload fields with sensitive names. The sanitizer avoids substring-only false positives such as `monkey`, `keyboard`, and `keynote`, but it is not a replacement for strict payload design.

## Local Testing

1. Create or select the `NorbApp Fuel` project in NDP.
2. Generate an ingest key from the NDP project ingestion UI.
3. Put the local endpoint and key in `local.properties`.
4. Build and run the app.
5. Open the main screen and perform a trip calculation.
6. Check the NDP Timeline for Android events.
7. Use NDP correlation and AI export on the generated trace.

For Android emulator builds, use:

```properties
NDP_INGEST_ENDPOINT=http://10.0.2.2:4000/api/ingest/events
```

For a real device, use the computer LAN address or a tunnel.

## Known Limitations

- The first integration uses session IDs only and does not create a persistent installation ID.
- The NDP ingest key is suitable for local/debug use only when embedded in an APK.
- Fuel does not automatically create the NDP project or rotate credentials.
- There is no durable offline queue.
- Process death can lose queued telemetry.
- Telemetry delivery is not guaranteed.
- Manual end-to-end validation requires a running local NDP database, server, and web UI.

## Future Improvements

- Short-lived registration tokens or backend proxy for production-safe ingestion.
- Shared Android SDK packaging once NDP is distributed as a real dependency.
- Runtime commit SHA injection for richer trace-version correlation.
- Optional controlled E2E test app flow with a local mock NDP server.
