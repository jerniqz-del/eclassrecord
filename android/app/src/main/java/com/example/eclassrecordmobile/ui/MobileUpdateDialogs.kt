package com.example.eclassrecordmobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.eclassrecordmobile.data.LanSyncManager
import com.example.eclassrecordmobile.data.MobileUpdateInfo
import com.example.eclassrecordmobile.data.UpdateReminderOption

@Composable
fun MobileUpdateOfferDialog(
    update: MobileUpdateInfo,
    phoneVersionName: String,
    phoneVersionCode: Long,
    onRequestPackage: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Mobile update available") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(versionComparison(phoneVersionName, phoneVersionCode, update))
                Text("Ask the desktop to send the verified Android package over Wi-Fi or hotspot. It is not installed until you confirm.")
                if (update.releaseNotes.isNotBlank()) {
                    Text(update.releaseNotes, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
        confirmButton = {
            Button(onClick = onRequestPackage) { Text("Ask desktop to send update") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Not now") }
        },
    )
}

@Composable
fun MobileUpdateInstallDialog(
    update: MobileUpdateInfo,
    phoneVersionName: String,
    phoneVersionCode: Long,
    onInstall: () -> Unit,
    onRemindLater: (UpdateReminderOption) -> Unit,
) {
    AlertDialog(
        onDismissRequest = { onRemindLater(LanSyncManager.updateReminderOptions.first()) },
        title = { Text("Mobile update ready") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "Android ${update.versionName} is downloaded and verified. " +
                        "This phone is still ${phoneVersionName.ifBlank { "an older version" }}."
                )
                Text(versionComparison(phoneVersionName, phoneVersionCode, update))
                if (update.releaseNotes.isNotBlank()) {
                    Text(update.releaseNotes, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text("Remind later", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                    LanSyncManager.updateReminderOptions.forEach { option ->
                        TextButton(
                            onClick = { onRemindLater(option) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(option.label) }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onInstall) { Text("Update Now") }
        },
        dismissButton = {},
    )
}

@Composable
fun UpdateReminderButtons(onRemindLater: (UpdateReminderOption) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
        Text("Remind later", fontWeight = FontWeight.Bold, fontSize = 13.sp)
        LanSyncManager.updateReminderOptions.forEach { option ->
            TextButton(onClick = { onRemindLater(option) }, modifier = Modifier.fillMaxWidth()) {
                Text(option.label)
            }
        }
    }
}

private fun versionComparison(
    phoneVersionName: String,
    phoneVersionCode: Long,
    update: MobileUpdateInfo,
): String {
    val phone = if (phoneVersionName.isBlank()) "unknown" else "$phoneVersionName (build $phoneVersionCode)"
    return "This phone: $phone\nDesktop package: ${update.versionName} (build ${update.versionCode})"
}
