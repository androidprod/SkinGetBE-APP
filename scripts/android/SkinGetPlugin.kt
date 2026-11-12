package com.skingetbe.gui

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.Manifest
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class SkinArgs {
  lateinit var path: String
  lateinit var fileName: String
}

@InvokeArg
class NotificationArgs {
  var english: Boolean = false
}

@TauriPlugin
class SkinGetPlugin(private val activity: Activity) : Plugin(activity) {
  private fun skin(invoke: Invoke): Pair<File, String> {
    val args = invoke.parseArgs(SkinArgs::class.java)
    require(args.fileName.endsWith(".png", ignoreCase = true))
    require(args.fileName == File(args.fileName).name && !args.fileName.contains('\\'))
    val file = File(args.path).canonicalFile
    require(file.name == args.fileName && file.isFile && file.length() <= 8 * 1024 * 1024)
    // The command is passed only after Rust has validated the app's skins directory.
    return file to args.fileName
  }

  @Command
  fun shareSkin(invoke: Invoke) {
    try {
      val (source, name) = skin(invoke)
      val shareRoot = File(activity.cacheDir, "skin-share").apply { mkdirs() }
      shareRoot.listFiles()?.forEach { old ->
        if (System.currentTimeMillis() - old.lastModified() > 24 * 60 * 60 * 1000L) old.deleteRecursively()
      }
      val directory = File(shareRoot, java.util.UUID.randomUUID().toString()).apply { mkdirs() }
      val copy = File(directory, name)
      source.copyTo(copy, overwrite = true)
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.skinfiles", copy)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        clipData = android.content.ClipData.newUri(activity.contentResolver, name, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(Intent.createChooser(send, null))
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Cannot share skin")
    }
  }

  @Command
  fun saveSkin(invoke: Invoke) {
    try {
      val (_, name) = skin(invoke)
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "image/png"
        putExtra(Intent.EXTRA_TITLE, name)
      }
      startActivityForResult(invoke, intent, "saveResult")
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Cannot select a folder")
    }
  }

  @ActivityCallback
  fun saveResult(invoke: Invoke, result: ActivityResult) {
    if (result.resultCode == Activity.RESULT_CANCELED) {
      invoke.resolve(JSObject().apply { put("saved", false) })
      return
    }
    try {
      require(result.resultCode == Activity.RESULT_OK)
      val (source, _) = skin(invoke)
      val uri = requireNotNull(result.data?.data)
      val output = requireNotNull(activity.contentResolver.openOutputStream(uri, "wt"))
      output.use { source.inputStream().use { input -> input.copyTo(it) } }
      invoke.resolve(JSObject().apply { put("saved", true) })
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Cannot save skin")
    }
  }

  @Command
  fun startServerNotification(invoke: Invoke) {
    try {
      val english = invoke.parseArgs(NotificationArgs::class.java).english
      if (Build.VERSION.SDK_INT >= 33 &&
          ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
      }
      val intent = Intent(activity, ServerService::class.java).apply {
        putExtra(ServerService.EXTRA_ENGLISH, english)
      }
      ContextCompat.startForegroundService(activity, intent)
      invoke.resolve()
    } catch (error: Exception) {
      invoke.reject(error.message ?: "Cannot start server notification")
    }
  }
}
