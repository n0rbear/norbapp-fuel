package com.example.tikltsg.diagnostics

interface NdpTransport {
    fun send(config: NdpConfig, body: String): NdpTransportResult
}

sealed interface NdpTransportResult {
    data class Accepted(val statusCode: Int) : NdpTransportResult
    data class RetryableFailure(
        val statusCode: Int?,
        val retryAfterMs: Long? = null,
        val causeType: String? = null
    ) : NdpTransportResult

    data class PermanentFailure(
        val statusCode: Int?,
        val reason: String
    ) : NdpTransportResult

    data class AuthenticationFailure(val statusCode: Int) : NdpTransportResult
}

object NdpHttpStatusPolicy {
    fun classify(statusCode: Int, retryAfterHeader: String? = null): NdpTransportResult =
        when (statusCode) {
            in 200..299 -> NdpTransportResult.Accepted(statusCode)
            401, 403 -> NdpTransportResult.AuthenticationFailure(statusCode)
            400, 404, 409 -> NdpTransportResult.PermanentFailure(statusCode, "http_$statusCode")
            408, 429, 500, 502, 503, 504 -> NdpTransportResult.RetryableFailure(statusCode, retryAfterHeader.toRetryAfterMillis())
            else -> if (statusCode >= 500) {
                NdpTransportResult.RetryableFailure(statusCode)
            } else {
                NdpTransportResult.PermanentFailure(statusCode, "http_$statusCode")
            }
        }

    private fun String?.toRetryAfterMillis(): Long? =
        this?.trim()?.toLongOrNull()?.takeIf { it in 1..3_600 }?.times(1_000)
}
