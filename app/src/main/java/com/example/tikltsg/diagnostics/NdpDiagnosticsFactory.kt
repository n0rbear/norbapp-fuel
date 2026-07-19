package com.example.tikltsg.diagnostics

object NdpDiagnosticsFactory {
    fun create(config: NdpConfig = NdpConfig.fromBuildConfig()): NdpDiagnostics =
        if (config.isComplete) NdpClient(config) else NdpNoOpClient
}
