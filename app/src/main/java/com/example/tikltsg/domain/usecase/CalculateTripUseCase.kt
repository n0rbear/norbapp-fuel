package com.example.tikltsg.domain.usecase

import com.example.tikltsg.data.api.DirectionsResponse
import com.example.tikltsg.domain.model.*

class CalculateTripUseCase {

    fun simulate(
        vehicle: Vehicle,
        routeResponse: DirectionsResponse,
        isRoundTrip: Boolean
    ): List<Double> {
        val consumptionPerKm = vehicle.consumption / 100.0
        val refuelPoints = mutableListOf<Double>()
        var currentFuel = vehicle.tankSize

        val totalDistMeters = routeResponse.routes.firstOrNull()?.legs?.sumOf { it.distance.value } ?: 0L
        val tripDist = if (isRoundTrip) (totalDistMeters / 1000.0) * 2 else (totalDistMeters / 1000.0)

        var simDistance = 0.0
        while (simDistance < tripDist) {
            simDistance += 1.0
            currentFuel -= consumptionPerKm

            if (currentFuel <= (vehicle.tankSize * 0.2) && (tripDist - simDistance) > 30) {
                refuelPoints.add(simDistance)
                currentFuel = vehicle.tankSize
            }
        }
        return refuelPoints
    }

    fun calculateFinal(
        vehicle: Vehicle,
        totalDistance: Double,
        selectedStations: Map<Int, FuelStation>,
        routeResponse: DirectionsResponse
    ): TripResult {
        val consumptionPerKm = vehicle.consumption / 100.0

        // Dinamikus üzemanyagköltség: végigmegyünk az úton, és ahol tankolunk, ott az adott kút árát vesszük.
        var totalFuelCost = 0.0
        var currentFuel = vehicle.tankSize
        var traveled = 0.0
        val refuelStops = mutableListOf<RefuelStop>()

        while (traveled < totalDistance) {
            traveled += 1.0
            currentFuel -= consumptionPerKm

            if (currentFuel <= (vehicle.tankSize * 0.2) && (totalDistance - traveled) > 30) {
                // Megkeressük a legközelebbi szimulált pontot (a kulcsok Int km állások).
                val kmPoint = selectedStations.keys.minByOrNull { Math.abs(it - traveled) } ?: 0
                val station = selectedStations[kmPoint]
                val price = if(vehicle.fuelType == "DIE") station?.priceDiesel else station?.priceBenzin ?: 1.70

                val fuelToFill = vehicle.tankSize - currentFuel
                totalFuelCost += fuelToFill * (price ?: 1.70)
                refuelStops.add(RefuelStop(traveled, station, price ?: 1.70, fuelToFill))
                currentFuel = vehicle.tankSize
            }
        }

        // Ha nem volt tankolás, az indulási (0. km) kút árával számolunk a teljes útra.
        if (totalFuelCost == 0.0) {
            val startStation = selectedStations[0]
            val startPrice = if(vehicle.fuelType == "DIE") startStation?.priceDiesel else startStation?.priceBenzin ?: 1.70
            totalFuelCost = totalDistance * consumptionPerKm * (startPrice ?: 1.70)
        }

        // --- OKOS MATRICA SZÁMÍTÁS ---
        var stickerCost = 0.0
        val countries = mutableSetOf<String>()
        val routeText = routeResponse.routes.firstOrNull()?.legs?.joinToString { it.start_address + " " + it.end_address } ?: ""

        fun contains(vararg keywords: String) = keywords.any { routeText.contains(it, ignoreCase = true) }

        if (contains("Magyar", "Hungary", "Ungarn", "Dorog", "Budapest", "H-")) countries.add("HU")
        if (contains("Austr", "Österreich", "Wien", "Salzburg", "Linz", "A-")) countries.add("AT")
        if (contains("Germany", "Német", "Deutschland", "Schramberg", "D-")) countries.add("DE")

        // Tranzit (DE <-> HU)
        if (countries.contains("HU") && countries.contains("DE")) countries.add("AT")

        countries.forEach {
            stickerCost += when (it) {
                "HU" -> 16.50
                "AT" -> 11.50
                else -> 0.0
            }
        }

        return TripResult(
            totalDistanceKm = totalDistance,
            totalFuelCost = totalFuelCost,
            totalStickerCost = stickerCost,
            stops = refuelStops,
            finalTotalCost = totalFuelCost + stickerCost
        )
    }
}
