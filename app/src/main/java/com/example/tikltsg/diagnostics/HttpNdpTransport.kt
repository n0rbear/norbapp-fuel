package com.example.tikltsg.diagnostics

import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URI
import java.io.IOException

class HttpNdpTransport : NdpTransport {
    override fun send(config: NdpConfig, body: String): NdpTransportResult {
        val endpoint = NdpSanitizer.sanitizeEndpoint(config.ingestEndpoint, "POST")
        return runCatching {
            NdpLog.d("event sending method=${endpoint.method} host=${endpoint.host} path=${endpoint.path}")
            val connection = URI(config.ingestEndpoint).toURL().openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "POST"
                connection.connectTimeout = config.timeoutMillis
                connection.readTimeout = config.timeoutMillis
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("X-NDP-Ingest-Key", config.ingestKey)
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                val status = connection.responseCode
                drainLimited(connection, status)
                val result = NdpHttpStatusPolicy.classify(status, connection.getHeaderField("Retry-After"))
                NdpLog.d("HTTP response status=$status result=${result::class.java.simpleName}")
                result
            } finally {
                connection.disconnect()
            }
        }.onFailure {
            NdpLog.w("network failure ${it::class.java.simpleName}: ${NdpSanitizer.sanitizeMessage(it.message)}", it)
        }.getOrElse {
            when (it) {
                is IOException, is SocketTimeoutException -> NdpTransportResult.RetryableFailure(null, causeType = it::class.java.simpleName)
                else -> NdpTransportResult.PermanentFailure(null, it::class.java.simpleName)
            }
        }
    }

    private fun drainLimited(connection: HttpURLConnection, status: Int) {
        val stream = if (status in 200..399) connection.inputStream else connection.errorStream
        stream?.use { input ->
            val buffer = ByteArray(512)
            input.read(buffer)
        }
    }
}
