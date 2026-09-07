package com.example.eclassrecordmobile.data

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.example.eclassrecordmobile.MainActivity
import com.example.eclassrecordmobile.R

object MobileUpdateNotifier {
    const val EXTRA_OPEN_UPDATE = "open_mobile_update"
    private const val CHANNEL_ID = "eclass_mobile_updates"
    private const val NOTIFICATION_ID = 71

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "App updates",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Notifies you when the desktop sends a new E-Class Record Mobile package."
        }
        manager.createNotificationChannel(channel)
    }

    fun notifyUpdateReady(context: Context, info: MobileUpdateInfo) {
        ensureChannel(context)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val launch = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_OPEN_UPDATE, true)
        }
        val pending = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setLargeIcon(BitmapFactory.decodeResource(context.resources, R.drawable.eclass_app_icon))
            .setContentTitle("Mobile update ready")
            .setContentText("Android ${info.versionName} was sent from the desktop. Install now or later.")
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    "Android ${info.versionName} is on this phone. Open E-Class Record to install now or remind later."
                )
            )
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }
}
