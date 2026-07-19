# NDP Integration

## Goal

NorbApp Fuel integrates with Norb Diagnostic Platform (NDP) so that local debug builds can be registered and observed through the existing NDP timeline, correlation engine, and AI export flow.

## Architecture

Fuel uses a small Android diagnostics layer in `com.example.tikltsg.diagnostics`. The layer follows the existing NDP Android ingest contract:

- `POST /api/ingest/events`
- Header: `X-NDP-Ingest-Key`
- Event source: `ANDROID`

The client is asynchronous, uses a bounded in-memory queue, short network timeout, and limited retries. NDP errors are swallowed inside the diagnostics layer and never propagate into trip calculation or fuel search logic.

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
- `trip_calculation.started`
- `trip_calculation.succeeded`
- `trip_calculation.failed`
- `fuel_search.started`
- `fuel_search.succeeded`
- `fuel_search.failed`
- `api.request.started`
- `api.request.succeeded`
- `api.request.failed`
- `error.caught`

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
- Manual end-to-end validation requires a running local NDP database, server, and web UI.

## Future Improvements

- Short-lived registration tokens or backend proxy for production-safe ingestion.
- Shared Android SDK packaging once NDP is distributed as a real dependency.
- Runtime commit SHA injection for richer trace-version correlation.
- Optional controlled E2E test app flow with a local mock NDP server.
