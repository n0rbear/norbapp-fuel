package com.example.tikltsg.diagnostics

import com.example.tikltsg.BuildConfig

data class NdpConfig(
    val enabled: Boolean,
    val ingestEndpoint: String,
    val ingestKey: String,
    val environment: String,
    val appVersion: String,
    val buildNumber: String,
    val timeoutMillis: Int = 3_000,
    val maxQueueSize: Int = 100,
    val maxRetries: Int = 2
) {
    val isComplete: Boolean
        get() = enabled && ingestEndpoint.isNotBlank() && ingestKey.isNotBlank()

    companion object {
        fun fromBuildConfig(): NdpConfig =
            NdpConfig(
                enabled = BuildConfig.NDP_ENABLED,
                ingestEndpoint = BuildConfig.NDP_INGEST_ENDPOINT,
                ingestKey = BuildConfig.NDP_INGEST_KEY,
                environment = BuildConfig.NDP_ENVIRONMENT.ifBlank { "development" },
                appVersion = BuildConfig.VERSION_NAME,
                buildNumber = BuildConfig.VERSION_CODE.toString()
            )
    }
}
