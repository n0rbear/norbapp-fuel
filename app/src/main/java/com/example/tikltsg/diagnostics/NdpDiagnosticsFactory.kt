package com.example.tikltsg.diagnostics

object NdpDiagnosticsFactory {
    fun create(config: NdpConfig = NdpConfig.fromBuildConfig()): NdpDiagnostics {
        NdpLog.configure(config.loggingEnabled)
        NdpLog.d(
            "initialization started enabled=${config.enabled} endpoint=${config.sanitizedEndpoint()} " +
                "environment=${config.environment} appVersion=${config.appVersion} build=${config.buildNumber}"
        )
        return if (config.isComplete) {
            NdpLog.d("initialization successful")
            NdpClient(config)
        } else {
            NdpLog.w("initialization failed or disabled: missing endpoint/key or NDP_ENABLED=false")
            NdpNoOpClient
        }
    }

    private fun NdpConfig.sanitizedEndpoint(): String =
        NdpSanitizer.sanitizeEndpoint(ingestEndpoint, "POST").let { "${it.host}${it.path}" }
}
