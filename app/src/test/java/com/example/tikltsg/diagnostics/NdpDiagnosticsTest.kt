package com.example.tikltsg.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executor

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
    fun sanitizerDoesNotExposeExactCoordinatesInEndpoint() {
        val endpoint = NdpSanitizer.sanitizeEndpoint(
            "https://example.com/api?lat=48.123456&lng=8.456789&apikey=SECRET",
            "get"
        )

        assertEquals("example.com", endpoint.host)
        assertEquals("/api", endpoint.path)
        assertEquals("GET", endpoint.method)
    }

    @Test
    fun disabledClientDoesNotSendNetworkRequest() {
        val transport = RecordingTransport()
        val client = NdpClient(
            config = config(enabled = false),
            transport = transport,
            executor = DirectExecutor
        )

        client.track(sampleEvent())

        assertEquals(0, transport.requests.size)
    }

    @Test
    fun networkFailureDoesNotEscapeBusinessFlow() {
        val client = NdpClient(
            config = config(maxRetries = 0),
            transport = RecordingTransport(success = false),
            executor = DirectExecutor
        )

        client.track(sampleEvent())

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
    fun screenTrackerDoesNotEmitDuplicateMainOpenEvents() {
        val diagnostics = RecordingDiagnostics()
        val tracker = NdpScreenTracker(diagnostics)

        tracker.trackMainOpened()
        tracker.trackMainOpened()

        assertEquals(1, diagnostics.events.count { it.eventType == "screen.main.opened" })
    }

    private fun config(enabled: Boolean = true, maxRetries: Int = 2) =
        NdpConfig(
            enabled = enabled,
            ingestEndpoint = "http://localhost:4000/api/ingest/events",
            ingestKey = "ndp_ingest_test",
            environment = "test",
            appVersion = "1.0",
            buildNumber = "1",
            maxRetries = maxRetries
        )

    private fun sampleEvent(payload: Map<String, Any?> = emptyMap()) =
        NdpEvent(
            traceId = "trace-test",
            eventType = "api.request.succeeded",
            severity = NdpSeverity.INFO,
            title = "API request succeeded",
            payload = payload
        )
}

private object DirectExecutor : Executor {
    override fun execute(command: Runnable) = command.run()
}

private class RecordingTransport(private val success: Boolean = true) : NdpTransport {
    val requests = mutableListOf<String>()

    override fun send(config: NdpConfig, body: String): Boolean {
        requests.add(body)
        return success
    }
}

private class RecordingDiagnostics : NdpDiagnostics {
    override val session = NdpSession("test-session")
    val events = mutableListOf<NdpEvent>()

    override fun track(event: NdpEvent) {
        events.add(event)
    }
}
