package com.example.tikltsg.diagnostics

import android.util.Log

object NdpLog {
    private const val tag = "NorbAppNdp"
    @Volatile
    private var enabled = false

    fun configure(enabled: Boolean) {
        this.enabled = enabled
    }

    fun d(message: String) {
        if (enabled) runCatching { Log.d(tag, NdpSanitizer.sanitizeMessage(message).orEmpty()) }
    }

    fun w(message: String, throwable: Throwable? = null) {
        if (!enabled) return
        val safeMessage = NdpSanitizer.sanitizeMessage(message).orEmpty()
        val suffix = throwable?.let { " exceptionType=${it::class.java.simpleName}" }.orEmpty()
        runCatching { Log.w(tag, safeMessage + suffix) }
    }
}
