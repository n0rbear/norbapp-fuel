# NorbApp Fuel

## Project Overview

NorbApp Fuel is an Android reference application for planning trip fuel costs and nearby refueling points. The project is prepared as a source-available demonstration application and as the second NDP reference application.

## Current Status

The repository is in GitHub publication hardening. API credentials have been removed from Kotlin source files and are now provided through local configuration and generated `BuildConfig` fields.

## Main Features

- Route-based fuel cost estimation
- Optional current-location start point
- Multiple waypoint input
- Round-trip mode
- Fuel type selection
- Nearby fuel station lookup
- Manual fuel price override
- Basic country-based vignette cost estimation

## Technology Stack

- Kotlin
- Android Gradle Plugin
- Jetpack Compose
- Material 3
- Retrofit with Gson
- Google Maps and Places APIs
- Tankerkoenig API
- E-Control API
- JUnit and AndroidX test libraries

## Project Structure

```text
app/
  src/main/java/com/example/tikltsg/
    data/api/          Google API client and response models
    domain/model/      Domain data models
    domain/usecase/    Trip cost calculation use case
    presentation/      Compose screen and ViewModel
    service/           Fuel station API integration
    diagnostics/       NDP telemetry client and privacy sanitizer
    ui/theme/          Compose theme files
  src/main/res/        Android resources
gradle/                Gradle wrapper and version catalog
docs/                  Publication and project documentation
```

## Requirements

- Android Studio
- Android SDK with the configured compile SDK installed
- JDK compatible with the Android Gradle Plugin
- Local API keys for Google Maps/Places and Tankerkoenig

## Local Setup

1. Install Android Studio and the Android SDK.
2. Copy `local.properties.example` values into your local `local.properties`.
3. Add your own API keys.
4. Build and run the app from Android Studio or with the Gradle wrapper.

## API Key Configuration

`local.properties` is intentionally excluded from Git. `local.properties.example` is only a template and must not contain real credentials.

Expected local values:

```properties
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
TANKERKOENIG_API_KEY=your-tankerkoenig-api-key
```

The Gradle build reads these values from `local.properties` or environment variables and exposes them through generated `BuildConfig` fields.

Important: `BuildConfig` does not encrypt secrets. API keys included in an APK can be extracted, so the Google API key must be restricted by Android package name and signing certificate. Previously exposed keys must be rotated before public publication.

## NDP Integration

NorbApp Fuel can send privacy-limited diagnostics to Norb Diagnostic Platform through the existing Android ingest contract:

- Endpoint: `POST /api/ingest/events`
- Header: `X-NDP-Ingest-Key`
- Source: `ANDROID`

NDP telemetry is disabled by default. Configure it locally only when an NDP project and ingest key exist:

```properties
NDP_ENABLED=false
NDP_INGEST_ENDPOINT=http://10.0.2.2:4000/api/ingest/events
NDP_INGEST_KEY=
NDP_ENVIRONMENT=development
```

`NDP_INGEST_KEY` must not be committed. `BuildConfig` does not protect this key inside an APK. For production or broader distribution, use a short-lived registration credential or a backend proxy instead of a long-lived client-side ingest key.

The integration records app lifecycle, main screen open, trip calculation, fuel search, sanitized external API request status, and caught errors. It does not send exact GPS coordinates, route addresses, raw provider responses, headers, access tokens, API keys, or full stack traces. See `docs/NDP_INTEGRATION.md`.

Telemetry event names are centrally defined in `NdpEventNames` and use dot notation such as `trip_calculation.started`, `api.request.failed`, and `location.timed_out`. A business operation uses one operation trace ID from request through terminal success, validation failure, or failure. Session-level events are serialized with the active NDP session ID.

Delivery uses a typed transport result instead of a boolean. HTTP 2xx is accepted, 400/404/409 are permanent failures, 401/403 open an authentication circuit breaker, and retryable statuses such as 408/429/5xx are retried with capped exponential backoff. The queue is memory-only; process death can lose queued telemetry and delivery is not guaranteed.

Release logging is disabled by default. Debug logging can be enabled locally, but logs are passed through the shared sanitizer. The sanitizer removes common credential, authorization, query-string, path, contact, and coordinate patterns. Sanitization is a defense-in-depth layer and is not a substitute for avoiding sensitive payloads.

The current diagnostics code is intentionally still inside the Fuel app. The long-term direction is extraction into a shared NorbApp Diagnostics SDK after the app-specific boundaries are stable; see `docs/NDP_SDK_EXTRACTION_PLAN.md`.

## Build Commands

```powershell
.\gradlew.bat clean
.\gradlew.bat assembleDebug
.\gradlew.bat build
```

## Test and Lint Commands

```powershell
.\gradlew.bat testDebugUnitTest
.\gradlew.bat lintDebug
```

## Security Notes

- Do not commit `local.properties`, `.env` files, signing keys, API credentials, APKs, AABs, or keystores.
- Rotate any key that has ever been committed or shared outside its intended private environment.
- Keep NDP ingest keys local. Treat them as extractable from debug APKs when enabled.
- Enable secret scanning before publishing.
- Review staged files before the first commit.

## Google API Key Restrictions

The Google API key should be restricted in Google Cloud Console using:

- Android package name
- Android signing certificate fingerprint
- Only the specific APIs required by the app
- Usage quotas appropriate for a public reference application

## Known Limitations

- The project is a reference application and not a production release.
- API keys are still present in built APKs if configured locally.
- NDP telemetry uses a memory-only retry queue; queued events can be lost on process death and delivery is not guaranteed.
- NDP ingest keys provided through `BuildConfig` are not secret in built APKs.
- Some API integrations depend on third-party availability and usage limits.
- Release signing configuration has not been added.
- No public issue or security contact process has been finalized yet.

## Privacy and Location Permission Notes

The app requests internet and location permissions. Location access is used to determine the current start location when the user enables that option. Users should understand that route planning and fuel lookups may involve third-party APIs.

## NorbApp Design System

NorbApp UI changes must follow the official NorbApp Design System. The design system is maintained as a separate external reference and is not currently included in this repository. See `docs/DESIGN_SYSTEM.md`.

## NDP Reference Application Role

This repository is intended to serve as the second NDP reference application, demonstrating Android project structure, API integration, local secret handling, and GitHub publication hygiene.

## License

This project is not open source. It is source-available for reference and demonstration purposes only. All rights are reserved. See `LICENSE`.
