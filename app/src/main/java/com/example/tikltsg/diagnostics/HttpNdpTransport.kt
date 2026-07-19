package com.example.tikltsg.diagnostics

import java.net.HttpURLConnection
import java.net.URI

class HttpNdpTransport : NdpTransport {
    override fun send(config: NdpConfig, body: String): Boolean =
        runCatching {
            val connection = URI(config.ingestEndpoint).toURL().openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = config.timeoutMillis
            connection.readTimeout = config.timeoutMillis
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-NDP-Ingest-Key", config.ingestKey)
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            connection.responseCode in 200..299
        }.getOrDefault(false)
}
