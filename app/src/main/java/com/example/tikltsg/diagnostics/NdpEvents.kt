package com.example.tikltsg.diagnostics

object NdpEvents {
    fun appStarted() = NdpEvent(
        traceId = NdpSession.newTraceId(),
        eventType = "app.started",
        severity = NdpSeverity.INFO,
        title = "NorbApp Fuel started"
    )

    fun appForegrounded() = NdpEvent(NdpSession.newTraceId(), "app.foregrounded", NdpSeverity.INFO, "App foregrounded")
    fun appBackgrounded() = NdpEvent(NdpSession.newTraceId(), "app.backgrounded", NdpSeverity.INFO, "App backgrounded")
    fun mainScreenOpened(traceId: String) = NdpEvent(traceId, "screen.main.opened", NdpSeverity.INFO, "Main screen opened")

    fun tripStarted(traceId: String, inputValid: Boolean, distanceProvided: Boolean, consumptionProvided: Boolean, fuelPriceProvided: Boolean) =
        NdpEvent(
            traceId = traceId,
            eventType = "trip_calculation.started",
            severity = NdpSeverity.INFO,
            title = "Trip calculation started",
            payload = mapOf(
                "inputValid" to inputValid,
                "distanceProvided" to distanceProvided,
                "consumptionProvided" to consumptionProvided,
                "fuelPriceProvided" to fuelPriceProvided
            )
        )

    fun tripSucceeded(traceId: String, durationMs: Long, resultCategory: String) =
        NdpEvent(
            traceId = traceId,
            eventType = "trip_calculation.succeeded",
            severity = NdpSeverity.INFO,
            title = "Trip calculation succeeded",
            payload = mapOf("durationMs" to durationMs, "resultCategory" to resultCategory)
        )

    fun tripFailed(traceId: String, durationMs: Long, throwable: Throwable) =
        NdpEvent(
            traceId = traceId,
            eventType = "trip_calculation.failed",
            severity = NdpSeverity.ERROR,
            title = "Trip calculation failed",
            payload = errorPayload(throwable, "MainViewModel", "calculate") + mapOf("durationMs" to durationMs)
        )

    fun fuelSearchStarted(traceId: String, provider: String, locationAvailable: Boolean) =
        NdpEvent(
            traceId = traceId,
            eventType = "fuel_search.started",
            severity = NdpSeverity.INFO,
            title = "Fuel search started",
            payload = mapOf("provider" to provider, "locationAvailable" to locationAvailable)
        )

    fun fuelSearchSucceeded(traceId: String, provider: String, resultCount: Int, durationMs: Long) =
        NdpEvent(
            traceId = traceId,
            eventType = "fuel_search.succeeded",
            severity = NdpSeverity.INFO,
            title = "Fuel search succeeded",
            payload = mapOf("provider" to provider, "locationAvailable" to true, "resultCount" to resultCount, "durationMs" to durationMs)
        )

    fun fuelSearchFailed(traceId: String, provider: String, durationMs: Long, throwable: Throwable) =
        NdpEvent(
            traceId = traceId,
            eventType = "fuel_search.failed",
            severity = NdpSeverity.WARNING,
            title = "Fuel search failed",
            payload = errorPayload(throwable, "FuelRepository", "fetchNearbyFuel") + mapOf(
                "provider" to provider,
                "locationAvailable" to true,
                "durationMs" to durationMs,
                "failureCategory" to throwable::class.java.simpleName
            )
        )

    fun apiStarted(traceId: String, provider: String, method: String, url: String) =
        NdpEvent(
            traceId = traceId,
            eventType = "api.request.started",
            severity = NdpSeverity.INFO,
            title = "API request started",
            payload = endpointPayload(provider, method, url)
        )

    fun apiSucceeded(traceId: String, provider: String, method: String, url: String, durationMs: Long, statusCode: Int? = null) =
        NdpEvent(
            traceId = traceId,
            eventType = "api.request.succeeded",
            severity = NdpSeverity.INFO,
            title = "API request succeeded",
            payload = endpointPayload(provider, method, url) + mapOf("durationMs" to durationMs, "success" to true, "statusCode" to statusCode)
        )

    fun apiFailed(traceId: String, provider: String, method: String, url: String, durationMs: Long, throwable: Throwable, statusCode: Int? = null) =
        NdpEvent(
            traceId = traceId,
            eventType = "api.request.failed",
            severity = NdpSeverity.WARNING,
            title = "API request failed",
            payload = endpointPayload(provider, method, url) + mapOf(
                "durationMs" to durationMs,
                "success" to false,
                "statusCode" to statusCode,
                "failureCategory" to throwable::class.java.simpleName
            )
        )

    fun caughtError(throwable: Throwable, sourceComponent: String, operation: String) =
        NdpEvent(
            traceId = NdpSession.newTraceId(),
            eventType = "error.caught",
            severity = NdpSeverity.ERROR,
            title = "Caught application error",
            payload = errorPayload(throwable, sourceComponent, operation)
        )

    private fun endpointPayload(provider: String, method: String, url: String): Map<String, Any?> {
        val endpoint = NdpSanitizer.sanitizeEndpoint(url, method)
        return mapOf(
            "provider" to provider,
            "method" to endpoint.method,
            "host" to endpoint.host,
            "sanitizedPath" to endpoint.path
        )
    }

    private fun errorPayload(throwable: Throwable, sourceComponent: String, operation: String): Map<String, Any?> =
        mapOf(
            "exceptionType" to throwable::class.java.simpleName,
            "sanitizedMessage" to NdpSanitizer.sanitizeMessage(throwable.message),
            "sourceComponent" to sourceComponent,
            "operation" to operation
        )
}
