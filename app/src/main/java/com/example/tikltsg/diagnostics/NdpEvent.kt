package com.example.tikltsg.diagnostics

data class NdpEvent(
    val traceId: String,
    val eventType: String,
    val severity: NdpSeverity,
    val title: String,
    val description: String? = null,
    val payload: Map<String, Any?> = emptyMap(),
    val runtimeVersion: Map<String, String?> = emptyMap(),
    val timestamp: String = NdpTime.nowIso()
)
