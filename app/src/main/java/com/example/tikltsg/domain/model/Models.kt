package com.example.tikltsg.domain.model

data class Vehicle(
    val consumption: Double, // l/100km
    val fuelType: String,    // "DIE", "E5", "E10"
    val tankSize: Double     // Liter
)

data class Waypoint(
    val address: String,
    val lat: Double = 0.0,
    val lng: Double = 0.0
)

data class RefuelStop(
    val kmAt: Double,
    val selectedStation: FuelStation?,
    val pricePerLiter: Double,
    val fuelAmount: Double,
    val candidateStations: List<FuelStation> = emptyList()
)

data class TripResult(
    val totalDistanceKm: Double,
    val totalFuelCost: Double,
    val totalStickerCost: Double,
    val stops: List<RefuelStop>,
    val finalTotalCost: Double,
    val currency: String = "EUR"
)

data class FuelStation(
    val name: String,
    val address: String,
    val distance: Double, // in km (from route/current point)
    val priceBenzin: Double?,
    val priceDiesel: Double?,
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val brand: String? = null
)
