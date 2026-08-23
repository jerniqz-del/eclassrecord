package com.example.eclassrecordmobile.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.io.File

@Serializable
data class SchoolCloudUser(
    val id: String,
    val schoolId: String,
    val role: String,
    val status: String
)

@Serializable
data class SchoolCloudConnection(
    val schoolId: String,
    val endpoint: String,
    val sessionToken: String,
    val deviceId: String,
    val user: SchoolCloudUser,
    val configuredAt: String
)

data class PublicSchoolCloudConnection(
    val schoolId: String,
    val endpoint: String,
    val deviceId: String,
    val user: SchoolCloudUser,
    val configuredAt: String,
    val hasSession: Boolean
)

@Serializable
data class EncryptedSchoolAnnouncement(
    val id: String,
    val priority: String,
    val requiresAck: Boolean,
    val envelope: JsonObject,
    val payloadHash: String,
    val version: Int,
    val publishAt: String,
    val expiresAt: String? = null,
    val readAt: String? = null,
    val acknowledgedAt: String? = null
)

@Serializable
private data class AnnouncementCache(
    val schoolId: String,
    val announcements: List<EncryptedSchoolAnnouncement>
)

@Serializable
private data class SchoolContentSecret(
    val schoolId: String,
    val secret: String
)

object SchoolCloudStore {
    private const val CONNECTION_FILE = "school_cloud_connection.json"
    private const val ANNOUNCEMENTS_FILE = "school_cloud_announcements.json"
    private const val CONTENT_SECRET_FILE = "school_cloud_content_secret.json"
    private val json = Json { ignoreUnknownKeys = true }

    private fun connectionFile(context: Context) = File(context.filesDir, CONNECTION_FILE)
    private fun announcementsFile(context: Context) = File(context.filesDir, ANNOUNCEMENTS_FILE)
    private fun contentSecretFile(context: Context) = File(context.filesDir, CONTENT_SECRET_FILE)

    fun saveConnection(context: Context, connection: SchoolCloudConnection) {
        require(connection.schoolId.matches(Regex("^[a-zA-Z0-9_-]{8,80}$"))) { "Invalid School Cloud ID." }
        require(connection.sessionToken.matches(Regex("^[a-fA-F0-9]{64}$"))) { "Invalid session credential." }
        require(connection.deviceId.matches(Regex("^[a-zA-Z0-9_-]{8,100}$"))) { "Invalid device ID." }
        val protected = connection.copy(endpoint = SchoolCloudProtocol.normalizeEndpoint(connection.endpoint))
        SecureFileStore.writeText(connectionFile(context), json.encodeToString(protected))
    }

    fun loadConnection(context: Context): SchoolCloudConnection? {
        val file = connectionFile(context)
        if (!file.exists()) return null
        val stored = SecureFileStore.readText(file)
        val connection = json.decodeFromString<SchoolCloudConnection>(stored.text)
        if (stored.wasPlaintext) SecureFileStore.writeText(file, stored.text)
        return connection
    }

    fun publicConnection(context: Context): PublicSchoolCloudConnection? {
        val connection = loadConnection(context) ?: return null
        return PublicSchoolCloudConnection(
            schoolId = connection.schoolId,
            endpoint = connection.endpoint,
            deviceId = connection.deviceId,
            user = connection.user,
            configuredAt = connection.configuredAt,
            hasSession = connection.sessionToken.isNotBlank()
        )
    }

    fun disconnect(context: Context): Boolean {
        val connectionRemoved = connectionFile(context).let { !it.exists() || it.delete() }
        val cacheRemoved = announcementsFile(context).let { !it.exists() || it.delete() }
        val secretRemoved = contentSecretFile(context).let { !it.exists() || it.delete() }
        return connectionRemoved && cacheRemoved && secretRemoved
    }

    fun saveContentSecret(context: Context, schoolId: String, secret: String) {
        require(schoolId.matches(Regex("^[a-zA-Z0-9_-]{8,80}$"))) { "Invalid School Cloud ID." }
        require(secret.matches(Regex("^[a-fA-F0-9]{64}$"))) { "Invalid school content key." }
        SecureFileStore.writeText(contentSecretFile(context), json.encodeToString(SchoolContentSecret(schoolId, secret)))
    }

    fun loadContentSecret(context: Context, schoolId: String): String? {
        val file = contentSecretFile(context)
        if (!file.exists()) return null
        val stored = SecureFileStore.readText(file)
        val value = json.decodeFromString<SchoolContentSecret>(stored.text)
        require(value.schoolId == schoolId) { "School content key belongs to another deployment." }
        if (stored.wasPlaintext) SecureFileStore.writeText(file, stored.text)
        return value.secret
    }

    fun saveEncryptedAnnouncements(
        context: Context,
        schoolId: String,
        announcements: List<EncryptedSchoolAnnouncement>
    ) {
        val cache = AnnouncementCache(schoolId, announcements)
        SecureFileStore.writeText(announcementsFile(context), json.encodeToString(cache))
    }

    fun loadEncryptedAnnouncements(context: Context, schoolId: String): List<EncryptedSchoolAnnouncement> {
        val file = announcementsFile(context)
        if (!file.exists()) return emptyList()
        val stored = SecureFileStore.readText(file)
        val cache = json.decodeFromString<AnnouncementCache>(stored.text)
        require(cache.schoolId == schoolId) { "Announcement cache belongs to another school." }
        if (stored.wasPlaintext) SecureFileStore.writeText(file, stored.text)
        return cache.announcements
    }
}
