package com.skingetbe.gui

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class ServerService : Service() {
  companion object {
    const val EXTRA_ENGLISH = "english"
    private const val ACTION_STOP = "com.skingetbe.gui.STOP_SERVER"
    private const val CHANNEL = "server_running"
    private const val NOTIFICATION_ID = 1001
  }

  private external fun nativeRequestStop()
  private external fun nativeIsRunning(): Boolean

  private val handler = Handler(Looper.getMainLooper())
  private val check = object : Runnable {
    override fun run() {
      if (nativeIsRunning()) handler.postDelayed(this, 1000) else stopSelf()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    // Tauri loads the same library for the Activity; allow service recreation too.
    System.loadLibrary("skingetbe_gui")
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(
      NotificationChannel(CHANNEL, "SkinGetBE server", NotificationManager.IMPORTANCE_LOW)
    )
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      nativeRequestStop()
      handler.removeCallbacks(check)
      handler.post(check)
      return START_NOT_STICKY
    }
    val english = intent?.getBooleanExtra(EXTRA_ENGLISH, false) ?: false
    val stop = PendingIntent.getService(
      this, 1, Intent(this, ServerService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val open = PendingIntent.getActivity(
      this, 0, Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle("SkinGetBE")
      .setContentText(if (english) "Server running" else "サーバー起動中")
      .setContentIntent(open)
      .setOngoing(true)
      .addAction(0, if (english) "Stop" else "停止", stop)
      .build()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    handler.removeCallbacks(check)
    handler.postDelayed(check, 1000)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(check)
    super.onDestroy()
  }
}
