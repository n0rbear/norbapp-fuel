package com.example.tikltsg.diagnostics

import java.net.URI

data class SanitizedEndpoint(
    val host: String,
    val path: String,
    val method: String
)

object NdpSanitizer {
    private val sensitiveKeyPattern = Regex(
        "(password|token|authorization|secret|apikey|api_key|accesskey|access_key|key|email|phone|username|address|route|lat|lng|latitude|longitude)",
        RegexOption.IGNORE_CASE
    )
    private val secretTextPattern = Regex(
        "(AIza[0-9A-Za-z_\\-]+|ndp_ingest_[0-9A-Za-z_\\-]+|(?i)(apikey|api_key|token|authorization|secret)=([^\\s&]+))"
    )
    private val coordinatePattern = Regex("[-+]?\\d{1,3}\\.\\d{4,}")

    fun sanitizePayload(payload: Map<String, Any?>): Map<String, Any?> =
        payload.mapNotNull { (key, value) ->
            if (sensitiveKeyPattern.containsMatchIn(key)) {
                null
            } else {
                key to sanitizeValue(value)
            }
        }.toMap()

    fun sanitizeEndpoint(url: String, method: String): SanitizedEndpoint {
        val uri = runCatching { URI(url) }.getOrNull()
        return SanitizedEndpoint(
            host = uri?.host.orEmpty(),
            path = uri?.path?.ifBlank { "/" } ?: "",
            method = method.uppercase()
        )
    }

    fun sanitizeMessage(message: String?): String? {
        val safe = message
            ?.replace(secretTextPattern, "[REDACTED]")
            ?.replace(coordinatePattern, "[COORDINATE]")
            ?.take(240)
        return safe?.ifBlank { null }
    }

    private fun sanitizeValue(value: Any?): Any? =
        when (value) {
            is Map<*, *> -> sanitizePayload(value.mapKeys { it.key.toString() })
            is List<*> -> value.map { sanitizeValue(it) }
            is String -> sanitizeMessage(value)
            else -> value
        }
}
