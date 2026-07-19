package com.example.tikltsg

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.tikltsg.diagnostics.NdpDiagnostics
import com.example.tikltsg.diagnostics.NdpDiagnosticsFactory
import com.example.tikltsg.diagnostics.NdpEvents
import com.example.tikltsg.domain.usecase.CalculateTripUseCase
import com.example.tikltsg.presentation.MainScreen
import com.example.tikltsg.presentation.MainViewModel
import com.example.tikltsg.presentation.ViewModelFactory
import com.example.tikltsg.ui.theme.UtikoltsegTheme

class MainActivity : ComponentActivity() {
    private val diagnostics: NdpDiagnostics by lazy { NdpDiagnosticsFactory.create() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        diagnostics.track(NdpEvents.appStarted())
        enableEdgeToEdge()
        setContent {
            UtikoltsegTheme {
                val calculateTripUseCase = CalculateTripUseCase()
                val factory = ViewModelFactory(calculateTripUseCase, applicationContext, diagnostics)
                val mainViewModel: MainViewModel = viewModel(factory = factory)

                MainScreen(mainViewModel, diagnostics)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        diagnostics.track(NdpEvents.appForegrounded())
    }

    override fun onStop() {
        diagnostics.track(NdpEvents.appBackgrounded())
        super.onStop()
    }
}
