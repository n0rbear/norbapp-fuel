package com.example.tikltsg.diagnostics

object NdpEventNames {
    const val APP_STARTED = "app.started"
    const val APP_FOREGROUNDED = "app.foregrounded"
    const val APP_BACKGROUNDED = "app.backgrounded"
    const val SCREEN_MAIN_OPENED = "screen.main.opened"
    const val TRIP_CALCULATION_REQUESTED = "trip_calculation.requested"
    const val TRIP_CALCULATION_STARTED = "trip_calculation.started"
    const val TRIP_CALCULATION_SUCCEEDED = "trip_calculation.succeeded"
    const val TRIP_CALCULATION_FAILED = "trip_calculation.failed"
    const val TRIP_CALCULATION_VALIDATION_FAILED = "trip_calculation.validation_failed"
    const val FUEL_SEARCH_REQUESTED = "fuel_search.requested"
    const val FUEL_SEARCH_STARTED = "fuel_search.started"
    const val FUEL_SEARCH_SUCCEEDED = "fuel_search.succeeded"
    const val FUEL_SEARCH_FAILED = "fuel_search.failed"
    const val LOCATION_REQUESTED = "location.requested"
    const val LOCATION_PERMISSION_DENIED = "location.permission_denied"
    const val LOCATION_STARTED = "location.started"
    const val LOCATION_SUCCEEDED = "location.succeeded"
    const val LOCATION_UNAVAILABLE = "location.unavailable"
    const val LOCATION_TIMED_OUT = "location.timed_out"
    const val LOCATION_FAILED = "location.failed"
    const val API_REQUEST_STARTED = "api.request.started"
    const val API_REQUEST_SUCCEEDED = "api.request.succeeded"
    const val API_REQUEST_FAILED = "api.request.failed"
    const val ERROR_CAUGHT = "error.caught"
    const val WAYPOINT_ADDED = "waypoint.added"
    const val WAYPOINT_REMOVED = "waypoint.removed"
    const val FUEL_TYPE_CHANGED = "fuel_type.changed"
    const val ROUND_TRIP_CHANGED = "round_trip.changed"
    const val STATION_SELECTED = "station.selected"

    val all = setOf(
        APP_STARTED,
        APP_FOREGROUNDED,
        APP_BACKGROUNDED,
        SCREEN_MAIN_OPENED,
        TRIP_CALCULATION_REQUESTED,
        TRIP_CALCULATION_STARTED,
        TRIP_CALCULATION_SUCCEEDED,
        TRIP_CALCULATION_FAILED,
        TRIP_CALCULATION_VALIDATION_FAILED,
        FUEL_SEARCH_REQUESTED,
        FUEL_SEARCH_STARTED,
        FUEL_SEARCH_SUCCEEDED,
        FUEL_SEARCH_FAILED,
        LOCATION_REQUESTED,
        LOCATION_PERMISSION_DENIED,
        LOCATION_STARTED,
        LOCATION_SUCCEEDED,
        LOCATION_UNAVAILABLE,
        LOCATION_TIMED_OUT,
        LOCATION_FAILED,
        API_REQUEST_STARTED,
        API_REQUEST_SUCCEEDED,
        API_REQUEST_FAILED,
        ERROR_CAUGHT,
        WAYPOINT_ADDED,
        WAYPOINT_REMOVED,
        FUEL_TYPE_CHANGED,
        ROUND_TRIP_CHANGED,
        STATION_SELECTED
    )
}

object NdpEvents {
    fun appStarted() = sessionEvent(NdpEventNames.APP_STARTED, "NorbApp Fuel started")
    fun appForegrounded() = sessionEvent(NdpEventNames.APP_FOREGROUNDED, "App foregrounded")
    fun appBackgrounded() = sessionEvent(NdpEventNames.APP_BACKGROUNDED, "App backgrounded")
    fun mainScreenOpened() = sessionEvent(NdpEventNames.SCREEN_MAIN_OPENED, "Main screen opened", mapOf("screen" to "main"))

    fun tripRequested(operation: NdpOperationContext, inputValid: Boolean) = event(
        operation,
        NdpEventNames.TRIP_CALCULATION_REQUESTED,
        "Trip calculation requested",
        mapOf("inputValid" to inputValid)
    )

    fun tripStarted(operation: NdpOperationContext, inputValid: Boolean, distanceProvided: Boolean, consumptionProvided: Boolean, fuelPriceProvided: Boolean) =
        event(
            operation,
            NdpEventNames.TRIP_CALCULATION_STARTED,
            "Trip calculation started",
            mapOf(
                "inputValid" to inputValid,
                "distanceProvided" to distanceProvided,
                "consumptionProvided" to consumptionProvided,
                "fuelPriceProvided" to fuelPriceProvided
            )
        )

    fun tripSucceeded(operation: NdpOperationContext, resultCategory: String) =
        event(operation, NdpEventNames.TRIP_CALCULATION_SUCCEEDED, "Trip calculation succeeded", durationPayload(operation) + mapOf("resultCategory" to resultCategory))

    fun tripFailed(operation: NdpOperationContext, throwable: Throwable) =
        event(operation, NdpEventNames.TRIP_CALCULATION_FAILED, "Trip calculation failed", errorPayload(throwable, "MainViewModel", "calculate") + durationPayload(operation), NdpSeverity.ERROR)

    fun tripValidationFailed(operation: NdpOperationContext, reasonCategory: String, inputValid: Boolean, routeAvailable: Boolean? = null) =
        event(
            operation,
            NdpEventNames.TRIP_CALCULATION_VALIDATION_FAILED,
            "Trip calculation validation failed",
            durationPayload(operation) + mapOf("reasonCategory" to reasonCategory, "inputValid" to inputValid, "routeAvailable" to routeAvailable),
            NdpSeverity.WARNING
        )

    fun fuelSearchRequested(operation: NdpOperationContext, provider: String, locationAvailable: Boolean) =
        event(operation, NdpEventNames.FUEL_SEARCH_REQUESTED, "Fuel search requested", mapOf("provider" to provider, "locationAvailable" to locationAvailable))

    fun fuelSearchStarted(operation: NdpOperationContext, provider: String, locationAvailable: Boolean) =
        event(operation, NdpEventNames.FUEL_SEARCH_STARTED, "Fuel search started", mapOf("provider" to provider, "locationAvailable" to locationAvailable))

    fun fuelSearchSucceeded(operation: NdpOperationContext, provider: String, resultCount: Int) =
        event(operation, NdpEventNames.FUEL_SEARCH_SUCCEEDED, "Fuel search succeeded", durationPayload(operation) + mapOf("provider" to provider, "locationAvailable" to true, "resultCount" to resultCount))

    fun fuelSearchFailed(operation: NdpOperationContext, provider: String, throwable: Throwable) =
        event(operation, NdpEventNames.FUEL_SEARCH_FAILED, "Fuel search failed", errorPayload(throwable, "FuelRepository", "fetchNearbyFuel") + durationPayload(operation) + mapOf("provider" to provider, "locationAvailable" to true), NdpSeverity.WARNING)

    fun locationRequested(operation: NdpOperationContext, enabled: Boolean) =
        event(operation, NdpEventNames.LOCATION_REQUESTED, "Location requested", mapOf("enabled" to enabled))

    fun locationPermissionDenied(operation: NdpOperationContext) =
        event(operation, NdpEventNames.LOCATION_PERMISSION_DENIED, "Location permission denied", severity = NdpSeverity.WARNING)

    fun locationStarted(operation: NdpOperationContext) =
        event(operation, NdpEventNames.LOCATION_STARTED, "Location started", mapOf("provider" to "fused"))

    fun locationSucceeded(operation: NdpOperationContext, accuracyCategory: String) =
        event(operation, NdpEventNames.LOCATION_SUCCEEDED, "Location succeeded", durationPayload(operation) + mapOf("success" to true, "provider" to "fused", "accuracyCategory" to accuracyCategory))

    fun locationUnavailable(operation: NdpOperationContext) =
        event(operation, NdpEventNames.LOCATION_UNAVAILABLE, "Location unavailable", durationPayload(operation) + mapOf("success" to false, "provider" to "fused"), NdpSeverity.WARNING)

    fun locationTimedOut(operation: NdpOperationContext) =
        event(operation, NdpEventNames.LOCATION_TIMED_OUT, "Location timed out", durationPayload(operation) + mapOf("success" to false, "provider" to "fused"), NdpSeverity.WARNING)

    fun locationFailed(operation: NdpOperationContext, throwable: Throwable) =
        event(operation, NdpEventNames.LOCATION_FAILED, "Location failed", errorPayload(throwable, "MainViewModel", "toggleCurrentLocation") + durationPayload(operation) + mapOf("success" to false, "provider" to "fused"), NdpSeverity.WARNING)

    fun apiStarted(operation: NdpOperationContext, provider: String, method: String, url: String) =
        event(operation, NdpEventNames.API_REQUEST_STARTED, "API request started", endpointPayload(provider, method, url))

    fun apiSucceeded(operation: NdpOperationContext, provider: String, method: String, url: String, statusCode: Int? = null) =
        event(operation, NdpEventNames.API_REQUEST_SUCCEEDED, "API request succeeded", endpointPayload(provider, method, url) + durationPayload(operation) + mapOf("success" to true, "statusCode" to statusCode))

    fun apiFailed(operation: NdpOperationContext, provider: String, method: String, url: String, throwable: Throwable, statusCode: Int? = null) =
        event(operation, NdpEventNames.API_REQUEST_FAILED, "API request failed", endpointPayload(provider, method, url) + durationPayload(operation) + mapOf("success" to false, "statusCode" to statusCode, "failureCategory" to throwable::class.java.simpleName), NdpSeverity.WARNING)

    fun caughtError(throwable: Throwable, sourceComponent: String, operation: String, traceId: String = NdpSession.newTraceId()) =
        NdpEvent(traceId, NdpEventNames.ERROR_CAUGHT, NdpSeverity.ERROR, "Caught application error", payload = errorPayload(throwable, sourceComponent, operation))

    fun waypointAdded(count: Int) = sessionEvent(NdpEventNames.WAYPOINT_ADDED, "Waypoint added", mapOf("waypointCount" to count))
    fun waypointRemoved(count: Int) = sessionEvent(NdpEventNames.WAYPOINT_REMOVED, "Waypoint removed", mapOf("waypointCount" to count))
    fun fuelTypeChanged(fuelType: String) = sessionEvent(NdpEventNames.FUEL_TYPE_CHANGED, "Fuel type changed", mapOf("fuelType" to fuelType))
    fun roundTripChanged(enabled: Boolean) = sessionEvent(NdpEventNames.ROUND_TRIP_CHANGED, "Round trip changed", mapOf("enabled" to enabled))
    fun stationSelected(kmBucket: String, fuelType: String) = sessionEvent(NdpEventNames.STATION_SELECTED, "Station selected", mapOf("kmBucket" to kmBucket, "fuelType" to fuelType))

    private fun sessionEvent(eventType: String, title: String, payload: Map<String, Any?> = emptyMap()) =
        NdpEvent(NdpSession.newTraceId(), eventType, NdpSeverity.INFO, title, payload = payload)

    private fun event(
        operation: NdpOperationContext,
        eventType: String,
        title: String,
        payload: Map<String, Any?> = emptyMap(),
        severity: NdpSeverity = NdpSeverity.INFO
    ) = NdpEvent(
        traceId = operation.traceId,
        eventType = eventType,
        severity = severity,
        title = title,
        payload = payload + mapOf("operation" to operation.operation)
    )

    private fun durationPayload(operation: NdpOperationContext): Map<String, Any?> =
        mapOf("durationMs" to (System.currentTimeMillis() - operation.startedAtMs))

    private fun endpointPayload(provider: String, method: String, url: String): Map<String, Any?> {
        val endpoint = NdpSanitizer.sanitizeEndpoint(url, method)
        return mapOf("provider" to provider, "method" to endpoint.method, "host" to endpoint.host, "sanitizedPath" to endpoint.path)
    }

    private fun errorPayload(throwable: Throwable, sourceComponent: String, operation: String): Map<String, Any?> =
        mapOf(
            "exceptionType" to throwable::class.java.simpleName,
            "sanitizedMessage" to NdpSanitizer.sanitizeMessage(throwable.message),
            "sourceComponent" to sourceComponent,
            "operation" to operation
        )
}
