package com.example.tikltsg.data.api

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query

interface GoogleApiService {
    @GET("maps/api/directions/json")
    suspend fun getDirections(
        @Query("origin") origin: String,
        @Query("destination") destination: String,
        @Query("waypoints") waypoints: String?,
        @Query("key") apiKey: String
    ): DirectionsResponse

    @GET("maps/api/place/autocomplete/json")
    suspend fun getPlaceSuggestions(
        @Query("input") input: String,
        @Query("types") types: String = "establishment|geocode",
        @Query("key") apiKey: String
    ): PlaceAutocompleteResponse

    companion object {
        fun create(): GoogleApiService {
            return Retrofit.Builder()
                .baseUrl("https://maps.googleapis.com/")
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(GoogleApiService::class.java)
        }
    }
}

data class DirectionsResponse(val routes: List<Route>)
data class Route(val legs: List<Leg>)
data class Leg(
    val distance: TextValue,
    val duration: TextValue,
    val start_address: String,
    val end_address: String,
    val start_location: LatLngLiteral,
    val steps: List<Step>
)
data class Step(
    val distance: TextValue,
    val end_location: LatLngLiteral
)
data class LatLngLiteral(val lat: Double, val lng: Double)
data class TextValue(val value: Long, val text: String)

data class PlaceAutocompleteResponse(val predictions: List<Prediction>)
data class Prediction(val description: String, val place_id: String)
