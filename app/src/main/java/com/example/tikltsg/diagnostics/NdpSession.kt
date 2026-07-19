package com.example.tikltsg.diagnostics

import java.util.UUID

data class NdpSession(val id: String = UUID.randomUUID().toString()) {
    companion object {
        fun newTraceId(): String = UUID.randomUUID().toString()
    }
}
