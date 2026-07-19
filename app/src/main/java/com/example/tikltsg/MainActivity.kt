package com.example.tikltsg

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.tikltsg.domain.usecase.CalculateTripUseCase
import com.example.tikltsg.presentation.MainScreen
import com.example.tikltsg.presentation.MainViewModel
import com.example.tikltsg.presentation.ViewModelFactory
import com.example.tikltsg.ui.theme.UtikoltsegTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            UtikoltsegTheme {
                val calculateTripUseCase = CalculateTripUseCase()
                val factory = ViewModelFactory(calculateTripUseCase, applicationContext)
                val mainViewModel: MainViewModel = viewModel(factory = factory)

                MainScreen(mainViewModel)
            }
        }
    }
}
