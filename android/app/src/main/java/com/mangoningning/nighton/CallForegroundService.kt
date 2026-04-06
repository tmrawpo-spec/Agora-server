package com.mangoningning.nighton

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class CallForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "call_foreground_service"
        const val CHANNEL_NAME = "Call Background Service"
        const val NOTIFICATION_ID = 2001

        const val ACTION_START = "ACTION_START_CALL_SERVICE"
        const val ACTION_STOP = "ACTION_STOP_CALL_SERVICE"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_TEXT = "extra_text"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_START, null -> {
                val title = intent?.getStringExtra(EXTRA_TITLE) ?: "통화 진행 중"
                val text = intent?.getStringExtra(EXTRA_TEXT) ?: "앱 밖에서도 통화를 유지합니다"

                val notification = buildNotification(title, text)
                startForeground(NOTIFICATION_ID, notification)
                return START_STICKY
            }

            else -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "통화 진행 중"
                val text = intent.getStringExtra(EXTRA_TEXT) ?: "앱 밖에서도 통화를 유지합니다"

                val notification = buildNotification(title, text)
                startForeground(NOTIFICATION_ID, notification)
                return START_STICKY
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(title: String, text: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag()
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "통화 중 백그라운드 유지용 서비스"
                setShowBadge(false)
                setSound(null, null)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            }
            manager.createNotificationChannel(channel)
        }
    }

    private fun mutableFlag(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE
        } else {
            0
        }
    }
}