package com.example.eclassrecordmobile.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

data class MobileUpdateInfo(
    val versionName: String,
    val versionCode: Long,
    val size: Long,
    val sha256: String,
    val fileName: String,
    val releaseNotes: String,
)

object LanSyncManager {
    var isPaired by mutableStateOf(false)
        private set
    var isConnected by mutableStateOf(false)
        private set
    var connectionState by mutableStateOf("Wi-Fi not paired")
        private set
    var syncLog by mutableStateOf("Scan the desktop WLAN QR to pair over Wi-Fi.")
        private set
    var updateInfo by mutableStateOf<MobileUpdateInfo?>(null)
        private set
    var updateProgress by mutableStateOf(0)
        private set
    var dataRevision by mutableStateOf(0L)
        private set
    var activeDesktopAddress by mutableStateOf("")
        private set
    var desktopInterfaces by mutableStateOf("")
        private set
    var roundTripMs by mutableStateOf<Long?>(null)
        private set
    var diagnosticMessage by mutableStateOf("Pair the desktop to run network diagnostics.")
        private set

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val pollExecutor = Executors.newSingleThreadExecutor()
    private val actionExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var running = false
    @Volatile private var generation = 0L
    @Volatile private var pairing: LanPairing? = null
    private val clientId = "android-${UUID.randomUUID()}"
    private var lastUpdateCheckAt = 0L
    @Volatile private var activeHost = ""
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
        pairing = LanPairingStore.load(context)
        activeHost = pairing?.host.orEmpty()
        isPaired = pairing != null
        if (pairing != null) start(context)
    }

    fun pairFromQr(context: Context, rawValue: String): Boolean = runCatching {
        val parsed = LanPairingStore.parseQr(rawValue)
        LanPairingStore.save(context, parsed)
        pairing = parsed
        activeHost = parsed.host
        isPaired = true
        syncLog = "WLAN pairing saved. Connecting to ${parsed.host}..."
        restart(context)
        true
    }.getOrElse {
        syncLog = it.message ?: "The WLAN QR code could not be used."
        false
    }

    fun forget(context: Context) {
        generation += 1
        running = false
        LanPairingStore.clear(context)
        pairing = null
        isPaired = false
        isConnected = false
        updateInfo = null
        connectionState = "Wi-Fi not paired"
        activeDesktopAddress = ""
        desktopInterfaces = ""
        roundTripMs = null
        diagnosticMessage = "Pair the desktop to run network diagnostics."
        syncLog = "WLAN pairing removed."
    }

    private fun restart(context: Context) {
        generation += 1
        running = false
        start(context)
    }

    fun start(context: Context) {
        if (running || pairing == null) return
        running = true
        val loopGeneration = ++generation
        val appContext = context.applicationContext
        pollExecutor.execute {
            while (running && loopGeneration == generation) {
                try {
                    pullLatestSnapshot(appContext)
                    if (loopGeneration != generation) break
                    isConnected = true
                    connectionState = "Synced via Wi-Fi"
                    if (System.currentTimeMillis() - lastUpdateCheckAt > 5 * 60 * 1000) {
                        checkForUpdate(appContext)
                    }
                } catch (error: Exception) {
                    isConnected = false
                    connectionState = "Wi-Fi reconnecting"
                    diagnosticMessage = when (error) {
                        is SocketTimeoutException -> "Desktop did not respond. Check Windows Firewall, guest Wi-Fi, or AP/client isolation."
                        else -> "Desktop and phone may be on isolated router segments. Retrying trusted local discovery."
                    }
                    syncLog = error.message ?: diagnosticMessage
                    Thread.sleep(2000)
                }
            }
        }
    }

    private fun pullLatestSnapshot(context: Context) {
        val knownRevision = DatabaseHelper.getRevision()
        val response = request("GET", "/v1/events", "revision=$knownRevision", "")
        if (!response.optBoolean("success")) throw IllegalStateException(response.optString("error", "Desktop sync failed."))
        if (response.optBoolean("unchanged")) return
        val encrypted = response.getJSONObject("payload")
        val decoded = decrypt(encrypted)
        val revision = response.optLong("revision")
        val payload = json.decodeFromString<SyncPayload>(decoded).copy(revision = revision)
        DatabaseHelper.saveAuthoritativePayload(context, payload)
        dataRevision = revision
        syncLog = "Desktop revision $revision received automatically over Wi-Fi."
    }

    fun pushChanges(context: Context, authorizationPin: String): Boolean {
        if (!isConnected || pairing == null) {
            syncLog = "The paired desktop is not reachable over Wi-Fi."
            return false
        }
        val changes = DatabaseHelper.pendingChanges()
        if (changes.isEmpty()) {
            syncLog = "No unsynced mobile changes."
            return true
        }
        syncLog = "Sending ${changes.size} authorized mobile change${if (changes.size == 1) "" else "s"} over Wi-Fi..."
        actionExecutor.execute {
            try {
                val payload = JSONObject()
                    .put("baseRevision", DatabaseHelper.getRevision())
                    .put("authorizationPin", authorizationPin)
                    .put("changes", org.json.JSONArray(json.encodeToString(changes)))
                val body = JSONObject().put("payload", encrypt(payload.toString())).toString()
                val response = request("POST", "/v1/changes", "", body)
                if (!response.optBoolean("success")) throw IllegalStateException(response.optString("error", "Desktop rejected the mobile changes."))
                val accepted = response.optJSONObject("result")?.optInt("accepted", changes.size) ?: changes.size
                DatabaseHelper.clearUnsyncedScores(context.applicationContext)
                syncLog = "$accepted mobile change${if (accepted == 1) "" else "s"} saved automatically on the desktop."
            } catch (error: Exception) {
                syncLog = error.message ?: "Mobile changes could not be sent. They remain saved on this phone."
            }
        }
        return true
    }

    fun checkForUpdate(context: Context) {
        lastUpdateCheckAt = System.currentTimeMillis()
        actionExecutor.execute {
            runCatching {
                val response = request("GET", "/v1/mobile-update", "", "")
                if (!response.optBoolean("success")) return@runCatching
                val item = response.getJSONObject("update")
                val current = if (Build.VERSION.SDK_INT >= 28) {
                    context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
                } else {
                    @Suppress("DEPRECATION") context.packageManager.getPackageInfo(context.packageName, 0).versionCode.toLong()
                }
                val offered = item.optLong("versionCode")
                updateInfo = if (offered > current) MobileUpdateInfo(
                    versionName = item.optString("versionName"),
                    versionCode = offered,
                    size = item.optLong("size"),
                    sha256 = item.optString("sha256"),
                    fileName = item.optString("fileName", "E-Class-Record-Mobile.apk"),
                    releaseNotes = item.optString("releaseNotes"),
                ) else null
            }.onFailure { syncLog = "Update check paused: ${it.message}" }
        }
    }

    fun downloadAndInstallUpdate(context: Context) {
        val info = updateInfo ?: return
        actionExecutor.execute {
            try {
                updateProgress = 1
                val target = File(context.cacheDir, "mobile-updates/${info.fileName}")
                target.parentFile?.mkdirs()
                download("/v1/mobile-update/apk", target, info.size)
                val digest = sha256(target.readBytes())
                require(digest.equals(info.sha256, ignoreCase = true)) { "Downloaded APK checksum verification failed." }
                verifyApk(context, target)
                updateProgress = 100
                launchInstaller(context, target)
                syncLog = "Update verified. Confirm installation in Android."
            } catch (error: Exception) {
                updateProgress = 0
                syncLog = error.message ?: "The mobile update could not be installed."
            }
        }
    }

    private fun verifyApk(context: Context, apk: File) {
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        val archive = context.packageManager.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: throw IllegalStateException("The downloaded file is not a valid Android package.")
        require(archive.packageName == context.packageName) { "The update belongs to a different Android application." }
        val installed = context.packageManager.getPackageInfo(context.packageName, flags)
        fun fingerprints(info: android.content.pm.PackageInfo): Set<String> {
            val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners.orEmpty()
                else @Suppress("DEPRECATION") info.signatures.orEmpty()
            return signatures.map { sha256(it.toByteArray()) }.toSet()
        }
        require(fingerprints(archive) == fingerprints(installed)) { "The update signing certificate does not match the installed app." }
        val offeredCode = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else @Suppress("DEPRECATION") archive.versionCode.toLong()
        val currentCode = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else @Suppress("DEPRECATION") installed.versionCode.toLong()
        require(offeredCode > currentCode) { "Android already has this mobile version or a newer one." }
    }

    private fun launchInstaller(context: Context, apk: File) {
        if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            throw IllegalStateException("Allow E-Class Record Mobile to install updates, then tap Install Update again.")
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun request(method: String, endpoint: String, query: String, body: String): JSONObject {
        val config = pairing ?: throw IllegalStateException("WLAN pairing is not configured.")
        val suffix = buildString {
            append("session=").append(Uri.encode(config.sessionId))
            if (query.isNotBlank()) append('&').append(query)
        }
        val path = "$endpoint?$suffix"
        var lastError: Exception? = null
        val candidates = listOf(activeHost, config.host) + config.hosts
        for (host in candidates.filter(String::isNotBlank).distinct()) {
            try {
                return requestFromHost(config, host, method, path, body)
            } catch (error: Exception) {
                lastError = error
            }
        }
        discoverDesktop(config)?.let { discovered ->
            val updated = config.copy(host = discovered.first(), hosts = discovered)
            pairing = updated
            activeHost = updated.host
            appContext?.let { LanPairingStore.save(it, updated) }
            for (host in discovered) {
                try {
                    return requestFromHost(updated, host, method, path, body)
                } catch (error: Exception) {
                    lastError = error
                }
            }
        }
        throw lastError ?: IllegalStateException("The paired desktop was not found on this local network.")
    }

    private fun requestFromHost(config: LanPairing, host: String, method: String, path: String, body: String): JSONObject {
        val startedAt = System.nanoTime()
        val connection = open(config, path, host)
        connection.requestMethod = method
        connection.connectTimeout = 5000
        connection.readTimeout = 30000
        val timestamp = System.currentTimeMillis().toString()
        val canonical = listOf(method, path, timestamp, sha256(body.toByteArray())).joinToString("\n")
        connection.setRequestProperty("X-Eclass-Client", clientId)
        connection.setRequestProperty("X-Eclass-Timestamp", timestamp)
        connection.setRequestProperty("X-Eclass-Signature", hmac(config.secret, canonical))
        connection.setRequestProperty("Content-Type", "application/json")
        if (body.isNotEmpty()) {
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
        }
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (connection.responseCode !in 200..299) {
            throw IllegalStateException(runCatching { JSONObject(text).optString("error") }.getOrDefault("Desktop request failed (${connection.responseCode})."))
        }
        activeHost = host
        activeDesktopAddress = "$host:${config.port}"
        roundTripMs = ((System.nanoTime() - startedAt) / 1_000_000).coerceAtLeast(1)
        diagnosticMessage = "Desktop is reachable through the router. Ethernet and Wi-Fi are bridged correctly."
        return JSONObject(text)
    }

    private fun discoverDesktop(config: LanPairing): List<String>? {
        val nonce = UUID.randomUUID().toString().replace("-", "")
        val request = JSONObject()
            .put("kind", "eclass-discover")
            .put("version", 1)
            .put("sessionId", config.sessionId)
            .put("nonce", nonce)
            .toString().toByteArray(StandardCharsets.UTF_8)
        DatagramSocket().use { socket ->
            socket.broadcast = true
            socket.soTimeout = 900
            for (address in listOf("239.255.77.77", "255.255.255.255")) {
                runCatching { socket.send(DatagramPacket(request, request.size, InetAddress.getByName(address), 38472)) }
            }
            val responseBytes = ByteArray(8192)
            while (true) {
                val packet = DatagramPacket(responseBytes, responseBytes.size)
                try {
                    socket.receive(packet)
                } catch (_timeout: SocketTimeoutException) {
                    return null
                }
                val response = runCatching { JSONObject(String(packet.data, packet.offset, packet.length, StandardCharsets.UTF_8)) }.getOrNull() ?: continue
                if (response.optString("kind") != "eclass-discovery-result" || response.optString("nonce") != nonce) continue
                if (response.optString("sessionId") != config.sessionId) continue
                val hostsArray = response.optJSONArray("hosts") ?: continue
                val hosts = (0 until hostsArray.length()).mapNotNull { hostsArray.optString(it).takeIf(String::isNotBlank) }.distinct()
                val fingerprint = response.optString("certificateFingerprint")
                val port = response.optInt("port")
                val canonical = listOf(nonce, config.sessionId, port, hosts.joinToString(","), fingerprint).joinToString("|")
                if (!constantTimeEquals(response.optString("signature"), hmac(config.secret, canonical))) continue
                if (!fingerprint.equals(config.certificateFingerprint, true) || port != config.port || hosts.isEmpty()) continue
                val interfaces = response.optJSONArray("interfaces")
                desktopInterfaces = if (interfaces == null) "Local network" else (0 until interfaces.length()).mapNotNull {
                    interfaces.optJSONObject(it)?.let { item -> "${item.optString("type")}: ${item.optString("address")}" }
                }.joinToString(" · ")
                diagnosticMessage = "Trusted desktop rediscovered across the router's wired and wireless network."
                return hosts
            }
        }
    }

    private fun download(endpoint: String, target: File, expectedSize: Long) {
        val config = pairing ?: throw IllegalStateException("WLAN pairing is not configured.")
        val path = "$endpoint?session=${Uri.encode(config.sessionId)}"
        val connection = open(config, path)
        val timestamp = System.currentTimeMillis().toString()
        val canonical = listOf("GET", path, timestamp, sha256(ByteArray(0))).joinToString("\n")
        connection.setRequestProperty("X-Eclass-Client", clientId)
        connection.setRequestProperty("X-Eclass-Timestamp", timestamp)
        connection.setRequestProperty("X-Eclass-Signature", hmac(config.secret, canonical))
        connection.connectTimeout = 5000
        connection.readTimeout = 60000
        require(connection.responseCode == 200) { "Desktop could not provide the mobile update." }
        connection.inputStream.use { input -> target.outputStream().use { output ->
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                output.write(buffer, 0, read)
                total += read
                if (expectedSize > 0) updateProgress = ((total * 100 / expectedSize).toInt()).coerceIn(1, 99)
            }
        } }
    }

    private fun open(config: LanPairing, path: String, host: String = activeHost.ifBlank { config.host }): HttpsURLConnection {
        val trust = object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
            override fun checkClientTrusted(chain: Array<X509Certificate>?, authType: String?) = Unit
            override fun checkServerTrusted(chain: Array<X509Certificate>?, authType: String?) {
                val certificate = chain?.firstOrNull() ?: throw java.security.cert.CertificateException("Desktop certificate missing.")
                val fingerprint = sha256(certificate.encoded)
                if (!fingerprint.equals(config.certificateFingerprint, ignoreCase = true)) {
                    throw java.security.cert.CertificateException("Desktop certificate changed. Scan its WLAN QR again.")
                }
            }
        }
        val ssl = SSLContext.getInstance("TLS")
        ssl.init(null, arrayOf(trust), null)
        return (URL("https://$host:${config.port}$path").openConnection() as HttpsURLConnection).apply {
            sslSocketFactory = ssl.socketFactory
            hostnameVerifier = javax.net.ssl.HostnameVerifier { _, _ -> true }
        }
    }

    private fun encrypt(value: String): JSONObject {
        val config = pairing ?: error("WLAN pairing is not configured.")
        val iv = ByteArray(12).also(java.security.SecureRandom()::nextBytes)
        val key = MessageDigest.getInstance("SHA-256").digest("eclass-companion-v1:${config.secret}".toByteArray())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        cipher.updateAAD("eclass-companion-v1".toByteArray())
        val combined = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        return JSONObject()
            .put("iv", base64Url(iv))
            .put("ciphertext", base64Url(combined.copyOfRange(0, combined.size - 16)))
            .put("tag", base64Url(combined.copyOfRange(combined.size - 16, combined.size)))
    }

    private fun decrypt(envelope: JSONObject): String {
        val config = pairing ?: error("WLAN pairing is not configured.")
        val iv = decodeBase64Url(envelope.getString("iv"))
        val ciphertext = decodeBase64Url(envelope.getString("ciphertext"))
        val tag = decodeBase64Url(envelope.getString("tag"))
        val key = MessageDigest.getInstance("SHA-256").digest("eclass-companion-v1:${config.secret}".toByteArray())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        cipher.updateAAD("eclass-companion-v1".toByteArray())
        return String(cipher.doFinal(ciphertext + tag), StandardCharsets.UTF_8)
    }

    private fun hmac(secret: String, value: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(value.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun constantTimeEquals(left: String, right: String): Boolean {
        val a = left.toByteArray(StandardCharsets.UTF_8)
        val b = right.toByteArray(StandardCharsets.UTF_8)
        return a.size == b.size && MessageDigest.isEqual(a, b)
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it) }
    private fun base64Url(bytes: ByteArray): String = android.util.Base64.encodeToString(bytes, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING)
    private fun decodeBase64Url(value: String): ByteArray = android.util.Base64.decode(value, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP)
}
