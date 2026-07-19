package com.example.tikltsg.diagnostics

object NdpJson {
    fun event(event: NdpEvent, config: NdpConfig, session: NdpSession): String =
        buildString {
            append("{")
            field("traceId", event.traceId)
            append(",")
            field("eventType", event.eventType)
            append(",")
            field("source", "ANDROID")
            append(",")
            field("severity", event.severity.name)
            append(",")
            field("title", event.title)
            event.description?.let {
                append(",")
                field("description", it)
            }
            append(",\"payload\":")
            append(value(NdpSanitizer.sanitizePayload(event.payload) + mapOf("ndpSessionId" to session.id)))
            append(",\"runtimeVersion\":")
            append(value(runtimeVersion(event, config)))
            append(",")
            field("timestamp", event.timestamp)
            append("}")
        }

    private fun runtimeVersion(event: NdpEvent, config: NdpConfig): Map<String, String> =
        mapOf(
            "environment" to config.environment,
            "appVersion" to config.appVersion,
            "buildNumber" to config.buildNumber,
            "serviceName" to "norbapp-fuel",
            "provider" to "android"
        ).plus(event.runtimeVersion)
            .mapValues { it.value?.trim() }
            .filterValues { !it.isNullOrBlank() }
            .mapValues { it.value.orEmpty() }

    private fun StringBuilder.field(key: String, value: String) {
        append("\"").append(escape(key)).append("\":\"").append(escape(value)).append("\"")
    }

    private fun value(value: Any?): String =
        when (value) {
            null -> "null"
            is String -> "\"${escape(value)}\""
            is Number, is Boolean -> value.toString()
            is Map<*, *> -> value.entries.joinToString(prefix = "{", postfix = "}") { (key, entryValue) ->
                "\"${escape(key.toString())}\":${value(entryValue)}"
            }
            is List<*> -> value.joinToString(prefix = "[", postfix = "]") { value(it) }
            else -> "\"${escape(value.toString())}\""
        }

    private fun escape(value: String): String =
        value.flatMap {
            when (it) {
                '\\' -> listOf('\\', '\\')
                '"' -> listOf('\\', '"')
                '\n' -> listOf('\\', 'n')
                '\r' -> listOf('\\', 'r')
                '\t' -> listOf('\\', 't')
                else -> listOf(it)
            }
        }.joinToString("")
}
