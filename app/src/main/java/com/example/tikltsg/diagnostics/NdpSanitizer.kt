package com.example.tikltsg.diagnostics

import java.net.URI

data class SanitizedEndpoint(
    val host: String,
    val path: String,
    val method: String
)

object NdpSanitizer {
    private val sensitiveKeys = setOf(
        "password",
        "token",
        "authorization",
        "secret",
        "apikey",
        "api_key",
        "apiKey",
        "accesskey",
        "access_key",
        "email",
        "phone",
        "username",
        "address",
        "route",
        "lat",
        "lng",
        "latitude",
        "longitude"
    )
    private val secretTextPattern = Regex(
        "(AIza[0-9A-Za-z_\\-]+|ndp_ingest_[0-9A-Za-z_\\-]+|(?i)(apikey|api_key|token|authorization|secret)=([^\\s&]+)|(?i)Bearer\\s+[0-9A-Za-z._\\-]+|(?i)Basic\\s+[0-9A-Za-z._\\-]+=*)"
    )
    private val coordinatePattern = Regex("[-+]?\\d{1,3}\\.\\d{4,}")
    private val emailPattern = Regex("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", RegexOption.IGNORE_CASE)
    private val phonePattern = Regex("(?<!\\d)(?:\\+?\\d[\\d\\s().-]{7,}\\d)(?!\\d)")
    private val windowsPathPattern = Regex("(?i)[A-Z]:\\\\[^\\s\"']+")
    private val urlQueryPattern = Regex("([?&])[^\\s#]+")
    private val longTokenPattern = Regex("(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])")

    fun sanitizePayload(payload: Map<String, Any?>): Map<String, Any?> =
        payload.mapNotNull { (key, value) ->
            if (isSensitiveKey(key)) {
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
            ?.replace(emailPattern, "[EMAIL]")
            ?.replace(phonePattern, "[PHONE]")
            ?.replace(windowsPathPattern, "[LOCAL_PATH]")
            ?.replace(urlQueryPattern) { match -> match.groupValues[1] + "[REDACTED_QUERY]" }
            ?.replace(coordinatePattern, "[COORDINATE]")
            ?.replace(longTokenPattern, "[REDACTED]")
            ?.take(240)
        return safe?.ifBlank { null }
    }

    private fun isSensitiveKey(key: String): Boolean =
        sensitiveKeys.any { it.equals(key, ignoreCase = true) }

    private fun sanitizeValue(value: Any?): Any? =
        when (value) {
            is Map<*, *> -> sanitizePayload(value.mapKeys { it.key.toString() })
            is List<*> -> value.map { sanitizeValue(it) }
            is String -> sanitizeMessage(value)
            else -> value
        }
}
