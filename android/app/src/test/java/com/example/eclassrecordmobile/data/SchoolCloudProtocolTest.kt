package com.example.eclassrecordmobile.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SchoolCloudProtocolTest {
    @Test
    fun endpointRequiresHttpsAndStripsTrailingSlash() {
        assertEquals(
            "https://school.example.workers.dev",
            SchoolCloudProtocol.normalizeEndpoint("https://school.example.workers.dev/")
        )
        assertThrows(IllegalArgumentException::class.java) {
            SchoolCloudProtocol.normalizeEndpoint("http://school.example.test")
        }
    }

    @Test
    fun endpointRejectsEmbeddedCredentialsOrQueries() {
        assertThrows(IllegalArgumentException::class.java) {
            SchoolCloudProtocol.normalizeEndpoint("https://user:pass@school.example.test")
        }
        assertThrows(IllegalArgumentException::class.java) {
            SchoolCloudProtocol.normalizeEndpoint("https://school.example.test?token=secret")
        }
    }

    @Test
    fun requestBoundaryAllowsOnlyMobileRoutes() {
        assertEquals(
            "GET" to "/v1/announcements",
            SchoolCloudProtocol.requireAllowed("get", "/v1/announcements")
        )
        assertThrows(IllegalArgumentException::class.java) {
            SchoolCloudProtocol.requireAllowed("POST", "/v1/setup/bootstrap")
        }
        assertThrows(IllegalArgumentException::class.java) {
            SchoolCloudProtocol.requireAllowed("GET", "https://attacker.test/v1/me")
        }
    }
}
