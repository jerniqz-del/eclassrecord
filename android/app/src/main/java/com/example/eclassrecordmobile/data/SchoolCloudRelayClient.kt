package com.example.eclassrecordmobile.data

import java.net.HttpURLConnection
import java.net.URL

class SchoolCloudRelayClient(
    private val connection: SchoolCloudConnection,
    private val connectTimeoutMs: Int = 15_000,
    private val readTimeoutMs: Int = 20_000
) {
    companion object {
        private const val MAX_REQUEST_BYTES = 1_800_000
        private const val MAX_RESPONSE_BYTES = 2_000_000
    }

    fun request(methodValue: String, pathValue: String, body: String? = null): String {
        val (method, path) = SchoolCloudProtocol.requireAllowed(methodValue, pathValue)
        val requestBytes = body?.toByteArray(Charsets.UTF_8)
        require(requestBytes == null || requestBytes.size <= MAX_REQUEST_BYTES) {
            "School Cloud request is too large."
        }

        val endpoint = SchoolCloudProtocol.normalizeEndpoint(connection.endpoint)
        val connectionUrl = URL(endpoint + path)
        val http = connectionUrl.openConnection() as HttpURLConnection
        try {
            http.requestMethod = method
            http.connectTimeout = connectTimeoutMs
            http.readTimeout = readTimeoutMs
            http.instanceFollowRedirects = false
            http.setRequestProperty("Accept", "application/json")
            http.setRequestProperty("Authorization", "Bearer ${connection.sessionToken}")
            if (requestBytes != null) {
                http.doOutput = true
                http.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                http.outputStream.use { it.write(requestBytes) }
            }

            val status = http.responseCode
            if (status in 300..399) throw IllegalStateException("School Cloud redirects are not allowed.")
            val stream = if (status in 200..299) http.inputStream else http.errorStream
            val response = stream?.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                var total = 0
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    require(total <= MAX_RESPONSE_BYTES) { "School Cloud response is too large." }
                    output.write(buffer, 0, count)
                }
                output.toString(Charsets.UTF_8.name())
            }.orEmpty()
            if (status !in 200..299) {
                throw IllegalStateException("School Cloud request failed (HTTP $status).")
            }
            return response
        } finally {
            http.disconnect()
        }
    }
}
