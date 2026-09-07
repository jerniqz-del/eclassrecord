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
import java.net.ConnectException
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
    var isUpdateReady by mutableStateOf(false)
        private set
    var updatePromptVisible by mutableStateOf(false)
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
    var pairedProfiles by mutableStateOf<List<LanPairing>>(emptyList())
        private set
    var activeProfileKey by mutableStateOf("")
        private set
    var autoReconnectEnabled by mutableStateOf(true)
        private set
    var linkQuality by mutableStateOf("Not linked")
        private set
    var linkStrength by mutableStateOf(0)
        private set
    var remoteControlState by mutableStateOf("Desktop remote control is ready after pairing.")
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
    private var downloadedUpdatePath = ""

    private const val UPDATE_PREFERENCES = "mobile_update_state"
    private const val READY_MANIFEST = "ready_manifest"
    private const val DEFERRED_UNTIL = "deferred_until"
    private const val UI_PREFERENCES = "mobile_ui_preferences"
    private const val AUTO_RECONNECT = "auto_reconnect"

    fun init(context: Context) {
        appContext = context.applicationContext
        pairing = LanPairingStore.load(context)
        pairedProfiles = LanPairingStore.list(context)
        pairing?.let { DatabaseHelper.selectProfile(context, it.profileKey) }
        activeProfileKey = pairing?.profileKey.orEmpty()
        activeHost = pairing?.host.orEmpty()
        isPaired = pairing != null
        autoReconnectEnabled = context.getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(AUTO_RECONNECT, true)
        restoreReadyUpdate(context.applicationContext)
        if (pairing != null && autoReconnectEnabled) start(context)
    }

    fun pairFromQr(context: Context, rawValue: String): Boolean = runCatching {
        val parsed = LanPairingStore.parseQr(rawValue)
        require(parsed.protocolVersion >= 2) {
            "This pairing QR is outdated. Refresh the Wi-Fi QR on the desktop and scan again."
        }
        LanPairingStore.save(context, parsed)
        pairing = parsed
        pairedProfiles = LanPairingStore.list(context)
        DatabaseHelper.selectProfile(context, parsed.profileKey)
        activeProfileKey = parsed.profileKey
        activeHost = parsed.host
        isPaired = true
        syncLog = "WLAN pairing saved. Connecting to ${parsed.host}..."
        restart(context)
        true
    }.getOrElse {
        syncLog = it.message ?: "The WLAN QR code could not be used."
        false
    }

    fun authorizeAndPair(
        context: Context,
        rawValue: String,
        authorizationPin: String,
        onComplete: (Boolean, String) -> Unit,
    ) {
        actionExecutor.execute {
            val previous = pairing
            try {
                val parsed = LanPairingStore.parseQr(rawValue)
                if (parsed.protocolVersion < 2) {
                    throw IllegalStateException("This pairing QR is outdated. Refresh the Wi-Fi QR on the desktop and scan again.")
                }
                require(authorizationPin.matches(Regex("\\d{6}"))) {
                    "Enter the six-digit desktop profile PIN."
                }
                pairing = parsed
                activeHost = parsed.host
                val payload = JSONObject()
                    .put("profileId", parsed.profileId)
                    .put("authorizationPin", authorizationPin)
                val body = JSONObject().put("payload", encrypt(payload.toString())).toString()
                val response = request("POST", "/v2/pair", "", body)
                val result = response.optJSONObject("result")
                require(response.optBoolean("success") && result?.optBoolean("authorized") == true) {
                    result?.optString("error").orEmpty().ifBlank { "The desktop rejected this pairing." }
                }
                LanPairingStore.save(context, parsed)
                MobilePinLock.enroll(context, parsed.profileKey, authorizationPin)
                pairedProfiles = LanPairingStore.list(context)
                DatabaseHelper.selectProfile(context, parsed.profileKey)
                activeProfileKey = parsed.profileKey
                isPaired = true
                syncLog = "Profile authorized. Connecting through Wi-Fi or hotspot..."
                restart(context)
                onComplete(true, syncLog)
            } catch (error: Exception) {
                pairing = previous
                activeHost = previous?.host.orEmpty()
                syncLog = when (error) {
                    is ConnectException, is SocketTimeoutException ->
                        "The desktop did not respond. On the desktop, open Windows Firewall, allow E-Class Record on Private networks, refresh the QR, and scan it again."
                    else -> error.message ?: "The desktop profile could not be paired."
                }
                onComplete(false, syncLog)
            }
        }
    }

    fun selectProfile(context: Context, profileKey: String): Boolean {
        val selected = LanPairingStore.select(context, profileKey) ?: return false
        BluetoothPairingStore.select(context, profileKey)
        generation += 1
        running = false
        pairing = selected
        activeHost = selected.host
        DatabaseHelper.selectProfile(context, selected.profileKey)
        activeProfileKey = selected.profileKey
        isPaired = true
        isConnected = false
        dataRevision = DatabaseHelper.getRevision()
        syncLog = "Selected " + selected.profileName + ". Connecting through Wi-Fi or hotspot..."
        start(context)
        return true
    }

    fun forget(context: Context) {
        val removedProfileKey = pairing?.profileKey.orEmpty()
        generation += 1
        running = false
        LanPairingStore.clear(context)
        BleServerManager.forgetDesktop(context, removedProfileKey)
        MobilePinLock.remove(context, removedProfileKey)
        pairedProfiles = LanPairingStore.list(context)
        pairing = LanPairingStore.load(context)
        pairing?.let { DatabaseHelper.selectProfile(context, it.profileKey) }
        activeProfileKey = pairing?.profileKey.orEmpty()
        isPaired = pairing != null
        isConnected = false
        connectionState = if (pairing == null) "Wi-Fi not paired" else "Profile selected"
        activeDesktopAddress = ""
        desktopInterfaces = ""
        roundTripMs = null
        linkQuality = "Not linked"
        linkStrength = 0
        diagnosticMessage = "Pair the desktop to run network diagnostics."
        syncLog = "WLAN pairing removed."
        if (pairing != null && autoReconnectEnabled) start(context.applicationContext)
    }

    fun deleteProfile(context: Context, profileKey: String): Boolean {
        if (profileKey.isBlank()) return false
        val knownProfile = LanPairingStore.list(context).any { it.profileKey == profileKey } ||
            BluetoothPairingStore.list(context).any { it.profileKey == profileKey }
        if (!knownProfile) return false
        val deletingActive = activeProfileKey == profileKey || DatabaseHelper.getActiveProfileKey() == profileKey
        if (!DatabaseHelper.deleteProfile(context, profileKey)) {
            syncLog = "The profile's local data could not be deleted. Nothing was unlinked."
            return false
        }

        if (deletingActive) {
            generation += 1
            running = false
        }
        LanPairingStore.remove(context, profileKey)
        BleServerManager.forgetDesktop(context, profileKey)
        MobilePinLock.remove(context, profileKey)
        pairedProfiles = LanPairingStore.list(context)

        if (!deletingActive) {
            syncLog = "Saved profile deleted from this phone."
            return true
        }

        val nextLan = LanPairingStore.load(context)
        val nextBluetooth = BluetoothPairingStore.load(context)
        when {
            nextLan != null -> {
                pairing = nextLan
                activeHost = nextLan.host
                DatabaseHelper.selectProfile(context, nextLan.profileKey)
                activeProfileKey = nextLan.profileKey
                isPaired = true
                isConnected = false
                connectionState = "Profile selected"
                syncLog = "Profile deleted. Selected ${nextLan.profileName}."
                if (autoReconnectEnabled) start(context.applicationContext)
            }
            nextBluetooth != null -> {
                pairing = null
                activeHost = ""
                activeProfileKey = nextBluetooth.profileKey
                isPaired = false
                isConnected = false
                connectionState = "Wi-Fi not paired"
                DatabaseHelper.selectProfile(context, nextBluetooth.profileKey)
                BluetoothPairingStore.select(context, nextBluetooth.profileKey)
                syncLog = "Profile deleted. Selected ${nextBluetooth.profileName} for Bluetooth fallback."
            }
            else -> {
                pairing = null
                activeHost = ""
                activeProfileKey = ""
                isPaired = false
                isConnected = false
                connectionState = "Wi-Fi not paired"
                syncLog = "Profile and its local data deleted from this phone."
            }
        }
        activeDesktopAddress = ""
        desktopInterfaces = ""
        roundTripMs = null
        linkQuality = "Not linked"
        linkStrength = 0
        diagnosticMessage = "Pair the desktop to run network diagnostics."
        return true
    }

    fun setAutoReconnect(context: Context, enabled: Boolean) {
        autoReconnectEnabled = enabled
        context.getSharedPreferences(UI_PREFERENCES, Context.MODE_PRIVATE).edit()
            .putBoolean(AUTO_RECONNECT, enabled).apply()
        if (enabled) {
            start(context.applicationContext)
        } else {
            generation += 1
            running = false
            isConnected = false
            connectionState = if (isPaired) "Automatic reconnect paused" else "Wi-Fi not paired"
        }
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
                    measureLinkQuality()
                    if (System.currentTimeMillis() - lastUpdateCheckAt > 5 * 60 * 1000) {
                        checkForUpdate(appContext)
                    }
                } catch (error: Exception) {
                    isConnected = false
                    connectionState = "Wi-Fi reconnecting"
                    linkStrength = (linkStrength - 20).coerceAtLeast(0)
                    linkQuality = if (linkStrength == 0) "Offline" else "Weak"
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
        val config = requireNotNull(pairing)
        if (config.protocolVersion >= 2) {
            require(payload.profileId == config.profileId) {
                "The desktop returned a different profile. Local pending changes were preserved."
            }
        }
        DatabaseHelper.saveAuthoritativePayload(context, payload)
        dataRevision = revision
        syncLog = "Desktop revision $revision received automatically over Wi-Fi."
    }

    fun pushChanges(context: Context, authorizationPin: String): Boolean {
        if (pairing == null) {
            syncLog = "Pair this profile over Wi-Fi or phone hotspot before pushing changes."
            return false
        }
        val changes = DatabaseHelper.pendingChanges()
        if (changes.isEmpty()) {
            syncLog = "No unsynced mobile changes."
            return true
        }
        syncLog = "Sending ${changes.size} authorized mobile change${if (changes.size == 1) "" else "s"} over Wi-Fi / hotspot..."
        actionExecutor.execute {
            try {
                val payload = JSONObject()
                    .put("protocolVersion", 2)
                    .put("desktopId", pairing?.desktopId.orEmpty())
                    .put("profileId", pairing?.profileId.orEmpty())
                    .put("batchId", UUID.randomUUID().toString())
                    .put("baseRevision", DatabaseHelper.getRevision())
                    .put("authorizationPin", authorizationPin)
                    .put("changes", org.json.JSONArray(json.encodeToString(changes)))
                val body = JSONObject().put("payload", encrypt(payload.toString())).toString()
                val response = request("POST", "/v1/changes", "", body)
                if (!response.optBoolean("success")) throw IllegalStateException(response.optString("error", "Desktop rejected the mobile changes."))
                val result = response.optJSONObject("result")
                val accepted = result?.optInt("accepted", changes.size) ?: changes.size
                val idArray = result?.optJSONArray("acceptedChangeIds")
                val acceptedIds = if (idArray == null) emptyList() else
                    (0 until idArray.length()).mapNotNull { idArray.optString(it).takeIf(String::isNotBlank) }
                if (acceptedIds.isNotEmpty()) {
                    DatabaseHelper.acknowledgeChanges(context.applicationContext, acceptedIds)
                } else if (pairing?.protocolVersion == 1 && accepted == changes.size) {
                    DatabaseHelper.clearUnsyncedScores(context.applicationContext)
                }
                syncLog = "$accepted mobile change${if (accepted == 1) "" else "s"} saved automatically on the desktop."
            } catch (error: Exception) {
                syncLog = error.message ?: "Mobile changes could not be sent. They remain saved on this phone."
            }
        }
        return true
    }

    fun sendDesktopCommand(command: String, args: Map<String, String> = emptyMap()): Boolean {
        if (pairing == null) {
            remoteControlState = "Pair this profile over Wi-Fi or phone hotspot to control the desktop."
            return false
        }
        remoteControlState = "Sending desktop control through Wi-Fi / hotspot..."
        actionExecutor.execute {
            try {
                val commandArgs = JSONObject().apply { args.forEach { (key, value) -> put(key, value) } }
                val payload = JSONObject()
                    .put("profileId", pairing?.profileId.orEmpty())
                    .put("command", command)
                    .put("args", commandArgs)
                val body = JSONObject().put("payload", encrypt(payload.toString())).toString()
                val response = request("POST", "/v1/tool-command", "", body)
                require(response.optBoolean("success")) {
                    response.optString("error", "The desktop rejected this control command.")
                }
                remoteControlState = "Desktop command completed through Wi-Fi / hotspot."
            } catch (error: Exception) {
                remoteControlState = error.message ?: "The desktop control command could not be delivered."
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
                val available = if (offered > current) MobileUpdateInfo(
                    versionName = item.optString("versionName"),
                    versionCode = offered,
                    size = item.optLong("size"),
                    sha256 = item.optString("sha256"),
                    fileName = item.optString("fileName", "E-Class-Record-Mobile.apk"),
                    releaseNotes = item.optString("releaseNotes"),
                ) else null
                updateInfo = available
                if (available == null) {
                    clearReadyUpdate(context)
                } else if (isUpdateReady && File(downloadedUpdatePath).exists() &&
                    JSONObject(context.getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE)
                        .getString(READY_MANIFEST, "{}") ?: "{}").optLong("versionCode") == available.versionCode
                ) {
                    updatePromptVisible = shouldPrompt(context)
                } else {
                    downloadUpdateInternal(context.applicationContext, available)
                }
            }.onFailure {
                if (!isUpdateReady) updateProgress = 0
                syncLog = "Update check paused: ${it.message}"
            }
        }
    }

    fun downloadUpdate(context: Context) {
        val info = updateInfo ?: return
        actionExecutor.execute {
            try {
                downloadUpdateInternal(context.applicationContext, info)
            } catch (error: Exception) {
                updateProgress = 0
                syncLog = error.message ?: "The mobile update could not be downloaded."
            }
        }
    }

    fun downloadAndInstallUpdate(context: Context) {
        if (isUpdateReady) installReadyUpdate(context) else downloadUpdate(context)
    }

    fun deferReadyUpdate(context: Context) {
        updatePromptVisible = false
        context.getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE).edit()
            .putLong(DEFERRED_UNTIL, System.currentTimeMillis() + 24 * 60 * 60 * 1000L)
            .apply()
        syncLog = "Mobile update kept securely on this device. You can install it later from Sync."
    }

    fun installReadyUpdate(context: Context) {
        val target = File(downloadedUpdatePath)
        if (!isUpdateReady || !target.exists()) {
            isUpdateReady = false
            updateProgress = 0
            syncLog = "The downloaded update is unavailable. Connect to the desktop to download it again."
            return
        }
        updatePromptVisible = false
        runCatching {
            verifyApk(context, target)
            launchInstaller(context, target)
            syncLog = "Update verified. Confirm installation in Android."
        }.onFailure { syncLog = it.message ?: "The mobile update could not be installed." }
    }

    private fun downloadUpdateInternal(context: Context, info: MobileUpdateInfo) {
        updateProgress = 1
        isUpdateReady = false
        updatePromptVisible = false
        val directory = File(context.filesDir, "mobile-updates").apply { mkdirs() }
        val target = File(directory, "${info.versionCode}-${File(info.fileName).name}")
        val incoming = File(directory, "${target.name}.incoming")
        incoming.delete()
        download("/v1/mobile-update/apk", incoming, info.size)
        val digest = sha256(incoming.readBytes())
        require(digest.equals(info.sha256, ignoreCase = true)) { "Downloaded APK checksum verification failed." }
        verifyApk(context, incoming)
        if (target.exists()) target.delete()
        require(incoming.renameTo(target)) { "The verified update could not be stored." }
        directory.listFiles()?.filter { it != target }?.forEach { it.delete() }
        downloadedUpdatePath = target.absolutePath
        isUpdateReady = true
        updateProgress = 100
        val manifest = JSONObject()
            .put("versionName", info.versionName).put("versionCode", info.versionCode)
            .put("size", info.size).put("sha256", info.sha256).put("fileName", info.fileName)
            .put("releaseNotes", info.releaseNotes).put("path", downloadedUpdatePath)
        val preferences = context.getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE)
        preferences.edit().putString(READY_MANIFEST, manifest.toString()).remove(DEFERRED_UNTIL).apply()
        updatePromptVisible = true
        syncLog = "Mobile update ${info.versionName} downloaded and verified. Install now or later."
    }

    private fun restoreReadyUpdate(context: Context) {
        val preferences = context.getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE)
        runCatching {
            val item = JSONObject(preferences.getString(READY_MANIFEST, "{}") ?: "{}")
            val info = MobileUpdateInfo(
                versionName = item.getString("versionName"), versionCode = item.getLong("versionCode"),
                size = item.getLong("size"), sha256 = item.getString("sha256"),
                fileName = item.getString("fileName"), releaseNotes = item.optString("releaseNotes"),
            )
            require(info.versionCode > installedVersionCode(context))
            val target = File(item.getString("path"))
            require(target.exists() && sha256(target.readBytes()).equals(info.sha256, true))
            verifyApk(context, target)
            updateInfo = info
            downloadedUpdatePath = target.absolutePath
            isUpdateReady = true
            updateProgress = 100
            updatePromptVisible = shouldPrompt(context)
        }.onFailure { clearReadyUpdate(context) }
    }

    private fun shouldPrompt(context: Context): Boolean =
        context.getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE)
            .getLong(DEFERRED_UNTIL, 0L) <= System.currentTimeMillis()

    private fun clearReadyUpdate(context: Context) {
        if (downloadedUpdatePath.isNotBlank()) File(downloadedUpdatePath).delete()
        downloadedUpdatePath = ""
        isUpdateReady = false
        updatePromptVisible = false
        updateProgress = 0
        context.getSharedPreferences(UPDATE_PREFERENCES, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun installedVersionCode(context: Context): Long = if (Build.VERSION.SDK_INT >= 28) {
        context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
    } else {
        @Suppress("DEPRECATION") context.packageManager.getPackageInfo(context.packageName, 0).versionCode.toLong()
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
            if (config.protocolVersion >= 2) append("&profile=").append(Uri.encode(config.profileId))
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
        connection.setRequestProperty("X-Eclass-Link-Rtt", (roundTripMs ?: 0L).toString())
        connection.setRequestProperty("X-Eclass-Link-Strength", linkStrength.toString())
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

    private fun measureLinkQuality() {
        request("GET", "/v1/health", "", "")
        val latency = roundTripMs ?: return
        linkStrength = when {
            latency <= 40 -> 100
            latency <= 100 -> 85
            latency <= 250 -> 65
            latency <= 500 -> 40
            else -> 20
        }
        linkQuality = when (linkStrength) {
            in 90..100 -> "Excellent"
            in 75..89 -> "Strong"
            in 55..74 -> "Good"
            in 30..54 -> "Weak"
            else -> "Poor"
        }
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
