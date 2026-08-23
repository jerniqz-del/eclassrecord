package com.example.eclassrecordmobile.data

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
private data class SchoolAnnouncementResponse(
    val announcements: List<EncryptedSchoolAnnouncement> = emptyList()
)

@Serializable
data class SchoolAnnouncementContent(
    val title: String,
    val message: String,
    val attachmentRefs: List<String> = emptyList()
)

data class SchoolAnnouncement(
    val id: String,
    val priority: String,
    val requiresAck: Boolean,
    val content: SchoolAnnouncementContent,
    val publishAt: String,
    val expiresAt: String?,
    val acknowledgedAt: String?
)

object SchoolCloudAnnouncementRepository {
    private val json = Json { ignoreUnknownKeys = true }

    fun refresh(context: Context): List<SchoolAnnouncement> {
        val connection = SchoolCloudStore.loadConnection(context)
            ?: throw IllegalStateException("Connect this device to School Cloud first.")
        val response = SchoolCloudRelayClient(connection).request("GET", "/v1/announcements")
        val encrypted = json.decodeFromString<SchoolAnnouncementResponse>(response).announcements
        SchoolCloudStore.saveEncryptedAnnouncements(context, connection.schoolId, encrypted)
        return decrypt(context, connection.schoolId, encrypted)
    }

    fun cached(context: Context): List<SchoolAnnouncement> {
        val connection = SchoolCloudStore.loadConnection(context) ?: return emptyList()
        val encrypted = SchoolCloudStore.loadEncryptedAnnouncements(context, connection.schoolId)
        return decrypt(context, connection.schoolId, encrypted)
    }

    fun acknowledge(context: Context, announcementId: String) {
        require(announcementId.matches(Regex("^[a-zA-Z0-9_-]{8,100}$"))) { "Invalid announcement." }
        val connection = SchoolCloudStore.loadConnection(context)
            ?: throw IllegalStateException("Connect this device to School Cloud first.")
        SchoolCloudRelayClient(connection).request(
            "POST",
            "/v1/announcements/${announcementId}/acknowledge",
            json.encodeToString(emptyMap<String, String>())
        )
    }

    private fun decrypt(
        context: Context,
        schoolId: String,
        encrypted: List<EncryptedSchoolAnnouncement>
    ): List<SchoolAnnouncement> {
        val contentSecret = SchoolCloudStore.loadContentSecret(context, schoolId)
            ?: throw IllegalStateException("Unlock the school announcement key first.")
        return encrypted.map { item ->
            val plaintext = SchoolCloudCrypto.decrypt(item.envelope, contentSecret)
            SchoolAnnouncement(
                id = item.id,
                priority = item.priority,
                requiresAck = item.requiresAck,
                content = json.decodeFromString<SchoolAnnouncementContent>(plaintext),
                publishAt = item.publishAt,
                expiresAt = item.expiresAt,
                acknowledgedAt = item.acknowledgedAt
            )
        }
    }
}
