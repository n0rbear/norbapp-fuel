package com.example.tikltsg.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class NdpDiagnosticsTest {
    @Test
    fun sanitizerRemovesApiKeysAndSensitiveQueryValues() {
        val payload = NdpSanitizer.sanitizePayload(
            mapOf(
                "apiKey" to "AIzaSyShouldNotAppear",
                "url" to "https://example.com/api?lat=48.123456&lng=8.456789&apikey=SECRET",
                "safe" to "kept"
            )
        )

        assertFalse(payload.containsKey("apiKey"))
        assertEquals("kept", payload["safe"])
        assertFalse(payload["url"].toString().contains("SECRET"))
        assertFalse(payload["url"].toString().contains("48.123456"))
    }

    @Test
    fun sanitizerRedactsValuePatternsWithoutDroppingSafeKeyWords() {
        val payload = NdpSanitizer.sanitizePayload(
            mapOf(
                "keyboard" to "monkey",
                "message" to "Bearer abcdefghijklmnopqrstuvwxyz123456 at test@example.com C:\\Example\\secret.txt +36 30 123 4567"
            )
        )

        assertEquals("monkey", payload["keyboard"])
        val message = payload["message"].toString()
        assertFalse(message.contains("Bearer"))
        assertFalse(message.contains("test@example.com"))
        assertFalse(message.contains("C:\\Example"))
        assertFalse(message.contains("+36 30"))
    }

    @Test
    fun calculationEventsShareOperationTrace() {
        val operation = NdpOperationContext(traceId = "calc-trace", operation = "trip_calculation", startedAtMs = 1)
        val events = listOf(
            NdpEvents.tripRequested(operation, inputValid = true),
            NdpEvents.tripStarted(operation, true, true, true, true),
            NdpEvents.tripSucceeded(operation, "cost_available"),
            NdpEvents.tripFailed(operation, IllegalStateException("boom"))
        )

        assertTrue(events.all { it.traceId == "calc-trace" })
    }

    @Test
    fun fuelSearchAndApiEventsShareOperationTrace() {
        val operation = NdpOperationContext(traceId = "fuel-trace", operation = "fuel_search", startedAtMs = 1)
        val events = listOf(
            NdpEvents.fuelSearchRequested(operation, "tankerkoenig", true),
            NdpEvents.fuelSearchStarted(operation, "tankerkoenig", true),
            NdpEvents.apiStarted(operation, "tankerkoenig", "GET", "https://example.com/list.php?apikey=SECRET"),
            NdpEvents.apiSucceeded(operation, "tankerkoenig", "GET", "https://example.com/list.php"),
            NdpEvents.fuelSearchSucceeded(operation, "tankerkoenig", 3)
        )

        assertTrue(events.all { it.traceId == "fuel-trace" })
    }

    @Test
    fun locationEventsShareOperationTrace() {
        val operation = NdpOperationContext(traceId = "location-trace", operation = "location", startedAtMs = 1)
        val events = listOf(
            NdpEvents.locationRequested(operation, true),
            NdpEvents.locationPermissionDenied(operation),
            NdpEvents.locationStarted(operation),
            NdpEvents.locationSucceeded(operation, "high"),
            NdpEvents.locationUnavailable(operation),
            NdpEvents.locationTimedOut(operation),
            NdpEvents.locationFailed(operation, IOException("timeout"))
        )

        assertTrue(events.all { it.traceId == "location-trace" })
    }

    @Test
    fun separateOperationsUseSeparateTraceIds() {
        assertNotEquals(NdpOperationContext(operation = "a").traceId, NdpOperationContext(operation = "b").traceId)
    }

    @Test
    fun sessionEventsSerializeCurrentSessionId() {
        val json = NdpJson.event(
            event = NdpEvents.appStarted(),
            config = config(),
            session = NdpSession("session-current")
        )

        assertTrue(json.contains("\"ndpSessionId\":\"session-current\""))
        assertTrue(json.contains("\"eventType\":\"app.started\""))
    }

    @Test
    fun eventNamesAreKnownDotNotationNames() {
        assertTrue(NdpEventNames.all.all { it.contains(".") })
        assertTrue(NdpEventNames.all.all { it.matches(Regex("[a-z0-9_]+(\\.[a-z0-9_]+)+")) })
        assertTrue(NdpEventNames.all.none { it == "app_started" || it == "screen_viewed" || it == "input_changed" })
    }

    @Test
    fun disabledClientDoesNotSendNetworkRequest() {
        val transport = RecordingTransport(NdpTransportResult.Accepted(202))
        val client = NdpClient(config = config(enabled = false), transport = transport, scheduler = ImmediateScheduler())

        client.track(sampleEvent())

        assertEquals(0, transport.requests.size)
    }

    @Test
    fun httpStatusPolicyClassifiesRequiredStatuses() {
        assertTrue(NdpHttpStatusPolicy.classify(202) is NdpTransportResult.Accepted)
        assertTrue(NdpHttpStatusPolicy.classify(400) is NdpTransportResult.PermanentFailure)
        assertTrue(NdpHttpStatusPolicy.classify(401) is NdpTransportResult.AuthenticationFailure)
        assertTrue(NdpHttpStatusPolicy.classify(403) is NdpTransportResult.AuthenticationFailure)
        assertTrue(NdpHttpStatusPolicy.classify(404) is NdpTransportResult.PermanentFailure)
        assertTrue(NdpHttpStatusPolicy.classify(408) is NdpTransportResult.RetryableFailure)
        assertTrue(NdpHttpStatusPolicy.classify(409) is NdpTransportResult.PermanentFailure)
        assertTrue(NdpHttpStatusPolicy.classify(500) is NdpTransportResult.RetryableFailure)
        assertTrue(NdpHttpStatusPolicy.classify(502) is NdpTransportResult.RetryableFailure)
        assertTrue(NdpHttpStatusPolicy.classify(503) is NdpTransportResult.RetryableFailure)
        assertTrue(NdpHttpStatusPolicy.classify(504) is NdpTransportResult.RetryableFailure)

        val rateLimited = NdpHttpStatusPolicy.classify(429, "2") as NdpTransportResult.RetryableFailure
        assertEquals(2_000L, rateLimited.retryAfterMs)
        val excessiveRetryAfter = NdpHttpStatusPolicy.classify(429, "7200") as NdpTransportResult.RetryableFailure
        assertEquals(null, excessiveRetryAfter.retryAfterMs)
    }

    @Test
    fun retryableFailureRetriesAutomaticallyWithoutNewEvent() {
        val scheduler = ManualScheduler()
        val transport = SequenceTransport(
            NdpTransportResult.RetryableFailure(503),
            NdpTransportResult.Accepted(202)
        )
        val client = NdpClient(config = config(maxRetries = 5), transport = transport, scheduler = scheduler)

        client.track(sampleEvent())

        assertEquals(1, client.queuedCount())
        assertEquals(1, scheduler.scheduledCount)
        scheduler.runNext()
        assertEquals(0, client.queuedCount())
        assertEquals(2, transport.requests.size)
    }

    @Test
    fun retryBackoffIncreasesAndIsCapped() {
        val scheduler = ManualScheduler()
        val client = NdpClient(
            config = config(maxRetries = 5, initialBackoffMillis = 10, maxBackoffMillis = 25),
            transport = RecordingTransport(NdpTransportResult.RetryableFailure(503)),
            scheduler = scheduler
        )

        client.track(sampleEvent())
        val firstDelay = scheduler.delays.first()
        scheduler.runNext()
        val secondDelay = scheduler.delays.last()

        assertTrue(firstDelay in 0..25)
        assertTrue(secondDelay in firstDelay..25)
    }

    @Test
    fun permanentFailureIsDroppedWithoutRetry() {
        val scheduler = ManualScheduler()
        val client = NdpClient(config = config(), transport = RecordingTransport(NdpTransportResult.PermanentFailure(400, "http_400")), scheduler = scheduler)

        client.track(sampleEvent())

        assertEquals(0, client.queuedCount())
        assertEquals(0, scheduler.scheduledCount)
    }

    @Test
    fun authFailureOpensCircuitAndDropsFutureEvents() {
        val transport = RecordingTransport(NdpTransportResult.AuthenticationFailure(401))
        val client = NdpClient(config = config(), transport = transport, scheduler = ImmediateScheduler())

        client.track(sampleEvent())
        client.track(sampleEvent())

        assertEquals(1, transport.requests.size)
        assertEquals(0, client.queuedCount())
    }

    @Test
    fun thrownIOExceptionIsTreatedAsRetryableAndRetried() {
        val scheduler = ManualScheduler()
        val transport = ThrowingOnceTransport(IOException("timeout"), NdpTransportResult.Accepted(202))
        val client = NdpClient(config = config(maxRetries = 3), transport = transport, scheduler = scheduler)

        client.track(sampleEvent())
        scheduler.runNext()

        assertEquals(0, client.queuedCount())
        assertEquals(2, transport.requests.size)
    }

    @Test
    fun newEventDuringRetryKeepsQueueOrder() {
        val scheduler = ManualScheduler()
        val transport = SequenceTransport(
            NdpTransportResult.RetryableFailure(503),
            NdpTransportResult.Accepted(202),
            NdpTransportResult.Accepted(202)
        )
        val client = NdpClient(config = config(maxRetries = 5), transport = transport, scheduler = scheduler)

        client.track(sampleEvent(title = "first"))
        client.track(sampleEvent(title = "second"))
        scheduler.runNext()

        assertTrue(transport.requests[1].contains("\"title\":\"first\""))
        assertTrue(transport.requests[2].contains("\"title\":\"second\""))
        assertEquals(0, client.queuedCount())
    }

    @Test
    fun maxRetryCountDropsEvent() {
        val scheduler = ManualScheduler()
        val client = NdpClient(config = config(maxRetries = 2), transport = RecordingTransport(NdpTransportResult.RetryableFailure(503)), scheduler = scheduler)

        client.track(sampleEvent())
        scheduler.runNext()

        assertEquals(0, client.queuedCount())
    }

    @Test
    fun eventJsonMatchesNdpIngestContractAndRedactsSecrets() {
        val json = NdpJson.event(
            event = sampleEvent(
                payload = mapOf(
                    "locationAvailable" to true,
                    "lat" to 48.123456,
                    "authorization" to "Bearer SECRET",
                    "provider" to "tankerkoenig"
                )
            ),
            config = config(),
            session = NdpSession("session-test")
        )

        assertTrue(json.contains("\"traceId\":\"trace-test\""))
        assertTrue(json.contains("\"eventType\":\"api.request.succeeded\""))
        assertTrue(json.contains("\"source\":\"ANDROID\""))
        assertTrue(json.contains("\"severity\":\"INFO\""))
        assertTrue(json.contains("\"runtimeVersion\""))
        assertTrue(json.contains("\"ndpSessionId\":\"session-test\""))
        assertFalse(json.contains("48.123456"))
        assertFalse(json.contains("SECRET"))
    }

    @Test
    fun sanitizerCoversCommonSecretAndPrivacyPatternsWithoutFalsePositives() {
        val message = NdpSanitizer.sanitizeMessage(
            "Basic dXNlcjpwYXNz api_key=SECRET AIzaSy12345678901234567890 ndp_ingest_SECRET " +
                "person@example.com +36 30 123 4567 47.497912 C:\\Users\\Name\\file.txt " +
                "https://example.com/path?token=SECRET abcdefghijklmnopqrstuvwxyz123456 monkey keyboard keynote"
        ).orEmpty()

        assertFalse(message.contains("Basic"))
        assertFalse(message.contains("api_key=SECRET"))
        assertFalse(message.contains("AIza"))
        assertFalse(message.contains("ndp_ingest"))
        assertFalse(message.contains("person@example.com"))
        assertFalse(message.contains("+36 30"))
        assertFalse(message.contains("47.497912"))
        assertFalse(message.contains("C:\\Users"))
        assertFalse(message.contains("token=SECRET"))
        assertFalse(message.contains("abcdefghijklmnopqrstuvwxyz123456"))
        assertTrue(message.contains("monkey"))
        assertTrue(message.contains("keyboard"))
        assertTrue(message.contains("keynote"))
    }

    @Test
    fun screenTrackerDoesNotEmitDuplicateMainOpenEvents() {
        val diagnostics = RecordingDiagnostics()
        val tracker = NdpScreenTracker(diagnostics)

        tracker.trackMainOpened()
        tracker.trackMainOpened()

        assertEquals(1, diagnostics.events.count { it.eventType == NdpEventNames.SCREEN_MAIN_OPENED })
    }

    private fun config(
        enabled: Boolean = true,
        maxRetries: Int = 5,
        initialBackoffMillis: Long = 1,
        maxBackoffMillis: Long = 10
    ) =
        NdpConfig(
            enabled = enabled,
            loggingEnabled = false,
            ingestEndpoint = "http://localhost:4000/api/ingest/events",
            ingestKey = "ndp_ingest_test",
            environment = "test",
            appVersion = "1.0",
            buildNumber = "1",
            maxRetries = maxRetries,
            initialBackoffMillis = initialBackoffMillis,
            maxBackoffMillis = maxBackoffMillis
        )

    private fun sampleEvent(payload: Map<String, Any?> = emptyMap(), title: String = "API request succeeded") =
        NdpEvent(
            traceId = "trace-test",
            eventType = NdpEventNames.API_REQUEST_SUCCEEDED,
            severity = NdpSeverity.INFO,
            title = title,
            payload = payload
        )
}

private class ImmediateScheduler : NdpTaskScheduler {
    override fun execute(command: () -> Unit) = command()
    override fun schedule(delayMillis: Long, command: () -> Unit) = command()
    override fun shutdown() = Unit
}

private class ManualScheduler : NdpTaskScheduler {
    private val scheduled = ArrayDeque<() -> Unit>()
    val delays = mutableListOf<Long>()
    val scheduledCount: Int get() = scheduled.size
    override fun execute(command: () -> Unit) = command()
    override fun schedule(delayMillis: Long, command: () -> Unit) {
        delays.add(delayMillis)
        scheduled.addLast(command)
    }
    override fun shutdown() = Unit
    fun runNext() {
        scheduled.removeFirst().invoke()
    }
}

private class RecordingTransport(private val result: NdpTransportResult) : NdpTransport {
    val requests = mutableListOf<String>()
    override fun send(config: NdpConfig, body: String): NdpTransportResult {
        requests.add(body)
        return result
    }
}

private class SequenceTransport(vararg results: NdpTransportResult) : NdpTransport {
    private val results = ArrayDeque(results.toList())
    val requests = mutableListOf<String>()
    override fun send(config: NdpConfig, body: String): NdpTransportResult {
        requests.add(body)
        return results.removeFirst()
    }
}

private class ThrowingOnceTransport(
    private val throwable: IOException,
    private val recovery: NdpTransportResult
) : NdpTransport {
    val requests = mutableListOf<String>()
    private var calls = 0

    override fun send(config: NdpConfig, body: String): NdpTransportResult {
        calls += 1
        requests.add(body)
        if (calls == 1) throw throwable
        return recovery
    }
}

private class RecordingDiagnostics : NdpDiagnostics {
    override val session = NdpSession("test-session")
    val events = mutableListOf<NdpEvent>()

    override fun track(event: NdpEvent) {
        events.add(event)
    }

    override fun flush() = Unit
    override fun shutdown() = Unit
}
