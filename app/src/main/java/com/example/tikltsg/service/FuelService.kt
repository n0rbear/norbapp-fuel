package com.example.tikltsg.service

import android.content.Context
import android.location.Geocoder
import com.example.tikltsg.domain.model.FuelStation
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import java.util.*

interface EControlApi {
    @GET("sprit/1.0/search/gas-stations/by-address")
    suspend fun getStations(
        @Query("latitude") lat: Double,
        @Query("longitude") lng: Double,
        @Query("fuelType") fuelType: String,
        @Query("includeClosed") includeClosed: Boolean = false
    ): List<EControlResponse>
}

data class EControlResponse(val name: String, val location: ELocation, val prices: List<EPrice>)
data class ELocation(val address: String)
data class EPrice(val amount: Double, val fuelType: String)

interface TankerkoenigApi {
    @GET("json/list.php")
    suspend fun getStations(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("rad") rad: Double = 10.0,
        @Query("type") type: String = "all",
        @Query("apikey") apiKey: String
    ): TankerResponse
}

data class TankerResponse(val ok: Boolean, val status: String, val stations: List<TStation>?)
data class TStation(val name: String, val street: String, val dist: Double, val diesel: Double?, val e5: Double?, val e10: Double?)

class FuelRepository(private val context: Context) {

    private val eControlApi = Retrofit.Builder()
        .baseUrl("https://api.e-control.at/")
        .addConverterFactory(GsonConverterFactory.create())
        .build().create(EControlApi::class.java)

    private val tankerApi = Retrofit.Builder()
        .baseUrl("https://creativecommons.tankerkoenig.de/")
        .addConverterFactory(GsonConverterFactory.create())
        .build().create(TankerkoenigApi::class.java)

    suspend fun fetchNearbyFuel(lat: Double, lng: Double, fuelType: String, apiKey: String): List<FuelStation> {
        val countryCode = getCountryCode(lat, lng)
        return try {
            when (countryCode) {
                "AT" -> fetchAustria(lat, lng, if(fuelType == "DIE") "DIE" else "SUP")
                else -> fetchGermany(lat, lng, apiKey)
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private suspend fun getCountryCode(lat: Double, lng: Double): String {
        return try {
            val geocoder = Geocoder(context, Locale.getDefault())
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                kotlinx.coroutines.suspendCancellableCoroutine { continuation ->
                    geocoder.getFromLocation(lat, lng, 1) { addr ->
                        continuation.resume(addr.firstOrNull()?.countryCode ?: "DE", onCancellation = null)
                    }
                }
            } else {
                @Suppress("DEPRECATION")
                val addr = geocoder.getFromLocation(lat, lng, 1)
                addr?.firstOrNull()?.countryCode ?: "DE"
            }
        } catch (e: Exception) { "DE" }
    }

    private suspend fun fetchAustria(lat: Double, lng: Double, fType: String): List<FuelStation> {
        return try {
            eControlApi.getStations(lat, lng, fType).map {
                val price = it.prices.firstOrNull { p -> p.fuelType == fType }?.amount
                FuelStation(
                    name = it.name,
                    address = it.location.address,
                    distance = 0.5,
                    priceBenzin = if (fType == "SUP") price else null,
                    priceDiesel = if (fType == "DIE") price else null,
                    lat = 0.0, lng = 0.0, brand = null
                )
            }
        } catch (e: Exception) { emptyList() }
    }

    private suspend fun fetchGermany(lat: Double, lng: Double, apiKey: String): List<FuelStation> {
        return try {
            val response = tankerApi.getStations(lat, lng, apiKey = apiKey)
            response.stations?.map {
                FuelStation(it.name, it.street, it.dist, it.e5 ?: it.e10, it.diesel, 0.0, 0.0, null)
            } ?: emptyList()
        } catch (e: Exception) { emptyList() }
    }
}
