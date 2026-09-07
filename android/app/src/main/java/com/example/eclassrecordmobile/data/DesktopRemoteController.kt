package com.example.eclassrecordmobile.data

object DesktopRemoteController {
    val isAvailable: Boolean
        get() = LanSyncManager.isPaired || BleServerManager.isAuthorized

    val transportLabel: String
        get() = when {
            LanSyncManager.isConnected -> "Wi-Fi / hotspot connected"
            LanSyncManager.isPaired -> "Wi-Fi / hotspot reconnecting"
            BleServerManager.isAuthorized -> "Bluetooth fallback connected"
            else -> "Pair Wi-Fi / hotspot to enable controls"
        }

    fun send(command: String, args: Map<String, String> = emptyMap()): Boolean {
        if (LanSyncManager.isConnected) return LanSyncManager.sendDesktopCommand(command, args)
        if (BleServerManager.isAuthorized) return BleServerManager.sendDesktopCommand(command, args)
        if (LanSyncManager.isPaired) return LanSyncManager.sendDesktopCommand(command, args)
        return false
    }

    fun openPage(page: String, assignmentId: String = ""): Boolean = send(
        "open-page",
        buildMap {
            put("page", page)
            if (assignmentId.isNotBlank()) put("assignmentId", assignmentId)
        },
    )

    fun openTool(toolId: String): Boolean = send("open-tool", mapOf("toolId" to toolId))

    fun toolAction(action: String): Boolean = send("tool-action", mapOf("action" to action))
}
