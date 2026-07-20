package com.example.tikltsg.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.tikltsg.BuildConfig
import com.example.tikltsg.data.api.GoogleApiService
import com.example.tikltsg.diagnostics.NdpDiagnostics
import com.example.tikltsg.diagnostics.NdpEvents
import com.example.tikltsg.diagnostics.NdpNoOpClient
import com.example.tikltsg.diagnostics.NdpOperationContext
import com.example.tikltsg.domain.model.*
import com.example.tikltsg.domain.usecase.CalculateTripUseCase
import com.example.tikltsg.service.FuelRepository
import com.google.android.gms.location.Priority
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException
import java.util.*

class MainViewModel(
    private val calculateTripUseCase: CalculateTripUseCase,
    private val context: Context,
    private val diagnostics: NdpDiagnostics = NdpNoOpClient
) : ViewModel() {

    private val googleApi = GoogleApiService.create()
    private val fuelRepository = FuelRepository(context, diagnostics)
    private val googleApiKey = BuildConfig.GOOGLE_MAPS_API_KEY
    private val tankerApiKey = BuildConfig.TANKERKOENIG_API_KEY

    val startAddress = MutableStateFlow("")
    val endAddress = MutableStateFlow("")
    val useCurrentLocation = MutableStateFlow(false)
    val isRoundTrip = MutableStateFlow(false)
    val waypoints = mutableStateListOf<String>()

    val consumption = MutableStateFlow("7.2")
    val tankSize = MutableStateFlow("50")
    val fuelType = MutableStateFlow("DIE")

    val manualFuelPrice = MutableStateFlow("")
    val isPriceError = MutableStateFlow(false)

    private val _stationsByKm = MutableStateFlow<Map<Int, List<FuelStation>>>(emptyMap())
    val stationsByKm = _stationsByKm.asStateFlow()

    val selectedStations = mutableStateMapOf<Int, FuelStation>()

    private val _tripResult = MutableStateFlow<TripResult?>(null)
    val tripResult = _tripResult.asStateFlow()

    val suggestions = mutableStateListOf<String>()

    fun onSearchQueryChanged(query: String) {
        if (query.length > 2) {
            viewModelScope.launch {
                try {
                    val response = googleApi.getPlaceSuggestions(query, apiKey = googleApiKey)
                    suggestions.clear()
                    suggestions.addAll(response.predictions.map { it.description })
                } catch (e: Exception) { suggestions.clear() }
            }
        } else { suggestions.clear() }
    }

    fun addWaypoint() {
        if (waypoints.size < 15) {
            waypoints.add("")
            diagnostics.track(NdpEvents.waypointAdded(waypoints.size))
        }
    }

    fun removeWaypoint(index: Int) {
        if (index in waypoints.indices) {
            waypoints.removeAt(index)
            diagnostics.track(NdpEvents.waypointRemoved(waypoints.size))
        }
    }

    fun setFuelType(value: String) {
        fuelType.value = value
        diagnostics.track(NdpEvents.fuelTypeChanged(value))
    }

    fun setRoundTrip(value: Boolean) {
        isRoundTrip.value = value
        diagnostics.track(NdpEvents.roundTripChanged(value))
    }

    fun selectStationForKm(km: Int, station: FuelStation) {
        selectedStations[km] = station
        diagnostics.track(NdpEvents.stationSelected(kmBucket(km), fuelType.value))
        calculate()
    }

    fun calculate() {
        isPriceError.value = false
        viewModelScope.launch {
            val operation = diagnostics.startOperation("trip_calculation")
            val inputValid = startAddress.value.isNotBlank() && endAddress.value.isNotBlank()
            diagnostics.track(NdpEvents.tripRequested(operation, inputValid))
            diagnostics.track(
                NdpEvents.tripStarted(
                    operation = operation,
                    inputValid = inputValid,
                    distanceProvided = startAddress.value.isNotBlank() && endAddress.value.isNotBlank(),
                    consumptionProvided = consumption.value.toDoubleOrNull() != null,
                    fuelPriceProvided = manualFuelPrice.value.toDoubleOrNull() != null || selectedStations.isNotEmpty()
                )
            )
            try {
                if (!inputValid) {
                    diagnostics.track(NdpEvents.tripValidationFailed(operation, "missing_required_address", inputValid = false, routeAvailable = null))
                    return@launch
                }
                val waypointsString = if (waypoints.isNotEmpty()) "optimize:true|" + waypoints.joinToString("|") else null
                val response = googleApi.getDirections(startAddress.value, endAddress.value, waypointsString, googleApiKey)

                val route = response.routes.firstOrNull()
                if (route == null) {
                    diagnostics.track(NdpEvents.tripValidationFailed(operation, "route_unavailable", inputValid = true, routeAvailable = false))
                    return@launch
                }
                val totalMeters = route.legs.sumOf { it.distance.value }
                val distanceKm = totalMeters / 1000.0

                val refuelKmPoints = calculateTripUseCase.simulate(
                    Vehicle(consumption.value.toDoubleOrNull() ?: 7.2, fuelType.value, tankSize.value.toDoubleOrNull() ?: 50.0),
                    response,
                    isRoundTrip.value
                )

                val newStationsByKm = mutableMapOf<Int, List<FuelStation>>()

                // Indulási kutak
                val startLoc = route.legs.first().start_location
                newStationsByKm[0] = fuelRepository.fetchNearbyFuel(startLoc.lat, startLoc.lng, fuelType.value, tankerApiKey, operation)

                // Tankolási pontok kutai
                refuelKmPoints.forEach { km ->
                    val loc = findLocationAtKm(response, km)
                    val stations = fuelRepository.fetchNearbyFuel(loc.lat, loc.lng, fuelType.value, tankerApiKey, operation)
                    newStationsByKm[km.toInt()] = stations
                }
                _stationsByKm.value = newStationsByKm

                val result = calculateTripUseCase.calculateFinal(
                    Vehicle(consumption.value.toDoubleOrNull() ?: 7.2, fuelType.value, tankSize.value.toDoubleOrNull() ?: 50.0),
                    if (isRoundTrip.value) distanceKm * 2 else distanceKm,
                    selectedStations.toMap(),
                    response
                )
                _tripResult.value = result
                diagnostics.track(
                    NdpEvents.tripSucceeded(
                        operation = operation,
                        resultCategory = if (result.finalTotalCost > 0.0) "cost_available" else "no_cost"
                    )
                )
            } catch (e: Exception) {
                diagnostics.track(NdpEvents.tripFailed(operation, e))
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, "Hiba a tervezéskor", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun findLocationAtKm(response: com.example.tikltsg.data.api.DirectionsResponse, targetKm: Double): com.example.tikltsg.data.api.LatLngLiteral {
        var accumulatedMeters = 0L
        val targetMeters = targetKm * 1000
        response.routes.first().legs.forEach { leg ->
            leg.steps.forEach { step ->
                accumulatedMeters += step.distance.value
                if (accumulatedMeters >= targetMeters) return step.end_location
            }
        }
        return response.routes.first().legs.last().steps.last().end_location
    }

    fun requestCurrentLocation(use: Boolean, operation: NdpOperationContext) {
        diagnostics.track(NdpEvents.locationRequested(operation, use))
    }

    fun onLocationPermissionResult(granted: Boolean, operation: NdpOperationContext) {
        if (!granted) diagnostics.track(NdpEvents.locationPermissionDenied(operation))
        toggleCurrentLocation(granted, operation, permissionGranted = granted)
    }

    fun toggleCurrentLocation(
        use: Boolean,
        operation: NdpOperationContext = diagnostics.startOperation("location"),
        permissionGranted: Boolean = hasLocationPermission()
    ) {
        useCurrentLocation.value = use
        if (use && !permissionGranted) {
            diagnostics.track(NdpEvents.locationPermissionDenied(operation))
            useCurrentLocation.value = false
            return
        }
        if (use) {
            viewModelScope.launch {
                diagnostics.track(NdpEvents.locationStarted(operation))
                try {
                    val fineLocationGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    val coarseLocationGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    if (!fineLocationGranted && !coarseLocationGranted) {
                        diagnostics.track(NdpEvents.locationPermissionDenied(operation))
                        useCurrentLocation.value = false
                        return@launch
                    }
                    val fused = com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(context)
                    val loc = try {
                        withTimeout(10_000) {
                            fused.lastLocation.await() ?: fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).await()
                        }
                    } catch (e: TimeoutCancellationException) {
                        diagnostics.track(NdpEvents.locationTimedOut(operation))
                        useCurrentLocation.value = false
                        return@launch
                    }

                    if (loc == null) {
                        diagnostics.track(NdpEvents.locationUnavailable(operation))
                        useCurrentLocation.value = false
                        return@launch
                    }

                    loc.let { location ->
                        diagnostics.track(
                            NdpEvents.locationSucceeded(
                                operation,
                                location.accuracyCategory()
                            )
                        )
                        val address = withContext(Dispatchers.IO) {
                            val geocoder = Geocoder(context, Locale.getDefault())
                            if (android.os.Build.VERSION.SDK_INT >= 33) {
                                kotlinx.coroutines.suspendCancellableCoroutine { continuation ->
                                    geocoder.getFromLocation(location.latitude, location.longitude, 1) {
                                        continuation.resume(it.firstOrNull()?.getAddressLine(0), onCancellation = null)
                                    }
                                }
                            } else {
                                @Suppress("DEPRECATION")
                                geocoder.getFromLocation(location.latitude, location.longitude, 1)?.firstOrNull()?.getAddressLine(0)
                            }
                        }
                        startAddress.value = address ?: "${location.latitude}, ${location.longitude}"
                    }
                } catch (e: Exception) {
                    diagnostics.track(NdpEvents.locationFailed(operation, e))
                    diagnostics.track(NdpEvents.caughtError(e, "MainViewModel", "toggleCurrentLocation", operation.traceId))
                    useCurrentLocation.value = false
                }
            }
        }
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun kmBucket(km: Int): String =
        when {
            km <= 0 -> "start"
            km < 100 -> "under_100"
            km < 500 -> "100_499"
            else -> "500_plus"
        }

    private fun Location.accuracyCategory(): String =
        when {
            !hasAccuracy() -> "unknown"
            accuracy <= 25f -> "high"
            accuracy <= 100f -> "medium"
            else -> "low"
        }
}
