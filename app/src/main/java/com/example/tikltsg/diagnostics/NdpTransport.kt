package com.example.tikltsg.diagnostics

interface NdpTransport {
    fun send(config: NdpConfig, body: String): Boolean
}
