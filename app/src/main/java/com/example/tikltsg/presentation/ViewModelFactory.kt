package com.example.tikltsg.presentation

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.tikltsg.diagnostics.NdpDiagnostics
import com.example.tikltsg.diagnostics.NdpNoOpClient
import com.example.tikltsg.domain.usecase.CalculateTripUseCase

class ViewModelFactory(
    private val calculateTripUseCase: CalculateTripUseCase,
    private val context: Context,
    private val diagnostics: NdpDiagnostics = NdpNoOpClient
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MainViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return MainViewModel(calculateTripUseCase, context, diagnostics) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
