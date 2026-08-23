package com.example.eclassrecordmobile.data

import java.net.URI

object SchoolCloudProtocol {
    private val allowed = listOf(
        "GET" to Regex("^/v1/me$"),
        "POST" to Regex("^/v1/admin-session/(activate|heartbeat)$"),
        "GET" to Regex("^/v1/announcements$"),
        "POST" to Regex("^/v1/announcements/[^/]+/acknowledge$"),
        "GET" to Regex("^/v1/notifications/summary$")
    )

    fun normalizeEndpoint(value: String): String {
        val parsed = try {
            URI(value.trim())
        } catch (_: Exception) {
            throw IllegalArgumentException("Enter a valid School Cloud address.")
        }
        require(parsed.scheme == "https") { "School Cloud requires HTTPS." }
        require(!parsed.host.isNullOrBlank()) { "School Cloud address has no host." }
        require(parsed.userInfo == null && parsed.query == null && parsed.fragment == null) {
            "School Cloud address must not contain credentials, query parameters, or fragments."
        }
        val path = (parsed.path ?: "").trimEnd('/')
        return URI("https", null, parsed.host, parsed.port, path, null, null).toString()
    }

    fun requireAllowed(methodValue: String, pathValue: String): Pair<String, String> {
        val method = methodValue.trim().uppercase()
        val path = pathValue.trim()
        require(path.startsWith("/v1/") && !path.contains("://") && !path.contains("..")) {
            "School Cloud request path is invalid."
        }
        require(allowed.any { (allowedMethod, pattern) -> allowedMethod == method && pattern.matches(path) }) {
            "School Cloud request is not allowed by the mobile security boundary."
        }
        return method to path
    }
}
