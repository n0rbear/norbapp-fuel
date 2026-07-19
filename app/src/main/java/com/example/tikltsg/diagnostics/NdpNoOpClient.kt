package com.example.tikltsg.diagnostics

object NdpNoOpClient : NdpDiagnostics {
    override val session = NdpSession("disabled")
    override fun track(event: NdpEvent) = Unit
}
