package com.example.tikltsg.diagnostics

object NdpNoOpClient : NdpDiagnostics {
    override val session = NdpSession("disabled")
    override fun track(event: NdpEvent) = Unit
    override fun flush() = Unit
    override fun shutdown() = Unit
}
