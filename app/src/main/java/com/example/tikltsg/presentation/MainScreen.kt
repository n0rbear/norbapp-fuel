package com.example.tikltsg.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.tikltsg.domain.model.FuelStation
import com.example.tikltsg.domain.model.TripResult

// Turquoise Color Palette
val TurquoiseLight = Color(0xFFE0F2F1)
val TurquoiseMain = Color(0xFF009688)
val TurquoiseDark = Color(0xFF00796B)
val TurquoiseSecondary = Color(0xFF26A69A)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: MainViewModel) {
    val tripResult by viewModel.tripResult.collectAsState()
    val isRoundTrip by viewModel.isRoundTrip.collectAsState()
    val useCurrentLoc by viewModel.useCurrentLocation.collectAsState()
    val startAddr by viewModel.startAddress.collectAsState()
    val endAddr by viewModel.endAddress.collectAsState()
    val cons by viewModel.consumption.collectAsState()
    val tSize by viewModel.tankSize.collectAsState()
    val fuelType by viewModel.fuelType.collectAsState()
    val suggestions = viewModel.suggestions
    val manualPrice by viewModel.manualFuelPrice.collectAsState()
    val isPriceError by viewModel.isPriceError.collectAsState()
    val stationsByKm by viewModel.stationsByKm.collectAsState()

    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = TurquoiseMain,
            secondary = TurquoiseSecondary,
            surfaceVariant = TurquoiseLight,
            onPrimary = Color.White
        )
    ) {
        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    title = { Text("Útiköltség Kalkulátor", fontWeight = FontWeight.Bold) },
                    colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                        containerColor = TurquoiseMain,
                        titleContentColor = Color.White
                    )
                )
            }
        ) { padding ->
            LazyColumn(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item { FuelHeaderGraphic() }

                item {
                    Text("Útvonal Beállítások", style = MaterialTheme.typography.titleMedium, color = TurquoiseDark)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(
                            checked = useCurrentLoc,
                            onCheckedChange = { viewModel.toggleCurrentLocation(it) },
                            colors = SwitchDefaults.colors(checkedThumbColor = TurquoiseMain)
                        )
                        Text("Jelenlegi pozíció használata", modifier = Modifier.padding(start = 8.dp))
                    }

                    AddressSearchField(
                        label = "Indulási hely",
                        value = startAddr,
                        onValueChange = {
                            viewModel.startAddress.value = it
                            viewModel.onSearchQueryChanged(it)
                        },
                        enabled = !useCurrentLoc,
                        suggestions = suggestions,
                        onSuggestionSelected = {
                            viewModel.startAddress.value = it
                            viewModel.onSearchQueryChanged("")
                        }
                    )
                }

                itemsIndexed(viewModel.waypoints) { index, waypoint ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = waypoint,
                            onValueChange = {
                                viewModel.waypoints[index] = it
                                viewModel.onSearchQueryChanged(it)
                            },
                            label = { Text("${index + 1}. megálló") },
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { viewModel.removeWaypoint(index) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Törlés", tint = Color.Red)
                        }
                    }
                }

                item {
                    Button(
                        onClick = { viewModel.addWaypoint() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = TurquoiseSecondary)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Text("Megálló hozzáadása")
                    }
                }

                item {
                    AddressSearchField(
                        label = "Célállomás",
                        value = endAddr,
                        onValueChange = {
                            viewModel.endAddress.value = it
                            viewModel.onSearchQueryChanged(it)
                        },
                        suggestions = suggestions,
                        onSuggestionSelected = {
                            viewModel.endAddress.value = it
                            viewModel.onSearchQueryChanged("")
                        }
                    )

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Switch(
                            checked = isRoundTrip,
                            onCheckedChange = { viewModel.isRoundTrip.value = it },
                            colors = SwitchDefaults.colors(checkedThumbColor = TurquoiseMain)
                        )
                        Text("Oda-vissza út", modifier = Modifier.padding(start = 8.dp))
                    }
                }

                item {
                    HorizontalDivider(color = TurquoiseLight, thickness = 2.dp)
                    Text("Jármű és Üzemanyag", style = MaterialTheme.typography.titleMedium, color = TurquoiseDark)

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("DIE" to "Diesel", "E5" to "Benzin E5", "E10" to "Benzin E10").forEach { (id, label) ->
                            FilterChip(
                                selected = fuelType == id,
                                onClick = { viewModel.fuelType.value = id },
                                label = { Text(label) },
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = TurquoiseMain, selectedLabelColor = Color.White)
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = cons,
                            onValueChange = { viewModel.consumption.value = it },
                            label = { Text("Fogyasztás") },
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = tSize,
                            onValueChange = { viewModel.tankSize.value = it },
                            label = { Text("Tank (L)") },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // --- DINAMIKUS TANKOLÁSI PONTOK ---
                    val stationsByKm by viewModel.stationsByKm.collectAsState()

                    stationsByKm.forEach { (km, stations) ->
                        val label = if (km == 0) "Benzinkutak az indulásnál:" else "Benzinkutak a(z) $km. km környékén:"
                        if (stations.isNotEmpty()) {
                            Text(label, style = MaterialTheme.typography.labelLarge, color = TurquoiseDark)
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                            ) {
                                items(stations.size) { index ->
                                    val station = stations[index]
                                    val stationPrice = if (fuelType == "DIE") station.priceDiesel else station.priceBenzin
                                    val isSelected = viewModel.selectedStations[km] == station

                                    Card(
                                        modifier = Modifier.width(170.dp),
                                        onClick = { viewModel.selectStationForKm(km, station) },
                                        colors = CardDefaults.cardColors(
                                            containerColor = if (isSelected) TurquoiseMain else Color.White
                                        ),
                                        border = BorderStroke(1.dp, TurquoiseMain)
                                    ) {
                                        Column(modifier = Modifier.padding(8.dp)) {
                                            Text(station.name, fontWeight = FontWeight.Bold, maxLines = 1, color = if (isSelected) Color.White else Color.Black)
                                            Text("${"%.2f".format(stationPrice ?: 0.0)} EUR/L", fontSize = 16.sp, color = if (isSelected) Color.White else TurquoiseDark)
                                            Text("${station.distance} km kitérő", fontSize = 11.sp, color = if (isSelected) Color.White.copy(0.7f) else Color.Gray)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    OutlinedTextField(
                        value = manualPrice,
                        onValueChange = { viewModel.manualFuelPrice.value = it },
                        label = { Text("Üzemanyag ár (EUR/L) - manuális felülbírálás") },
                        modifier = Modifier.fillMaxWidth(),
                        isError = isPriceError,
                        leadingIcon = { Icon(Icons.Default.LocalGasStation, contentDescription = null, tint = TurquoiseMain) }
                    )
                }

                item {
                    Button(
                        onClick = { viewModel.calculate() },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TurquoiseDark)
                    ) {
                        Text("KALKULÁCIÓ", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }

                tripResult?.let { result ->
                    item { ResultCard(result) }
                }
            }
        }
    }
}

@Composable
fun FuelHeaderGraphic() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(100.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(TurquoiseLight),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.LocalGasStation, contentDescription = null, modifier = Modifier.size(48.dp), tint = TurquoiseMain)
            Text("Üzemanyag Szimuláció", color = TurquoiseDark, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
fun ResultCard(it: TripResult) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TurquoiseLight)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Route, contentDescription = null, tint = TurquoiseMain)
                Text(" Eredmény", style = MaterialTheme.typography.headlineSmall, color = TurquoiseDark, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(12.dp))
            ResultRow("Össztáv", "${"%.1f".format(it.totalDistanceKm)} km")
            ResultRow("Üzemanyag költség", "${"%.2f".format(it.totalFuelCost)} ${it.currency}")
            ResultRow("Matrica díjak", "${"%.2f".format(it.totalStickerCost)} ${it.currency}")

            if (it.stops.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text("Tervezett tankolások:", fontWeight = FontWeight.Bold, color = TurquoiseDark)
                it.stops.forEach { stop ->
                    val stationInfo = stop.selectedStation?.let { " @ ${it.name}" } ?: ""
                    Text(
                        "- ${"%.0f".format(stop.kmAt)}. km-nél: ${"%.2f".format(stop.fuelAmount)}L (${"%.2f".format(stop.pricePerLiter)} EUR/L)$stationInfo",
                        fontSize = 14.sp
                    )
                }
            }

            HorizontalDivider(Modifier.padding(vertical = 12.dp), color = TurquoiseMain.copy(alpha = 0.3f))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("VÉGÖSSZEG", fontWeight = FontWeight.Black, fontSize = 20.sp, color = TurquoiseDark)
                Text("${"%.2f".format(it.finalTotalCost)} ${it.currency}", fontWeight = FontWeight.Black, fontSize = 24.sp, color = TurquoiseMain)
            }
        }
    }
}

@Composable
fun ResultRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Color.DarkGray)
        Text(value, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun AddressSearchField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    suggestions: List<String>,
    onSuggestionSelected: (String) -> Unit,
    enabled: Boolean = true
) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = { onValueChange(it); expanded = it.isNotEmpty() },
            label = { Text(label) },
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            trailingIcon = { if (value.isNotEmpty() && enabled) IconButton(onClick = { onValueChange("") }) { Icon(Icons.Default.Close, null) } }
        )
        if (expanded && suggestions.isNotEmpty()) {
            Surface(modifier = Modifier.fillMaxWidth(), tonalElevation = 8.dp, shadowElevation = 4.dp, shape = RoundedCornerShape(bottomStart = 8.dp, bottomEnd = 8.dp)) {
                Column {
                    suggestions.forEach { suggestion ->
                        DropdownMenuItem(text = { Text(suggestion) }, onClick = { onSuggestionSelected(suggestion); expanded = false })
                    }
                }
            }
        }
    }
}
