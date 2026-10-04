package com.learningos.tracker

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.learningos.tracker.Store.pairedDevice
import com.learningos.tracker.Store.lastSyncText
import com.learningos.tracker.Store.pairedServer
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.TimeUnit

/** Sends the last 7 days of totals to LearningOS's /api/usage. */
class SyncWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    override fun doWork(): Result =
        if (sync(applicationContext).startsWith("Synced")) Result.success() else Result.retry()

    companion object {

        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()

            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                "usage-sync",
                ExistingPeriodicWorkPolicy.KEEP,
                req
            )
        }

        /** Seconds per site for the local day [daysAgo] days back, browser + apps. */
        fun secondsForDay(ctx: Context, daysAgo: Int): Map<String, Long> {
            val day = Store.day(Store.dayStart(daysAgo))
            val apps = AppUsage.msForDay(ctx, daysAgo)

            return Store.SITES.associateWith { site ->
                (Store.webMs(ctx, day, site) + apps.getValue(site)) / 1000
            }
        }

        /** Runs off the main thread. Returns a status line for the screen. */
        fun sync(ctx: Context): String {
            val server = ctx.pairedServer.trimEnd('/')
            val device = ctx.pairedDevice

            if (server.isEmpty() || device.isEmpty()) {
                return "Not connected to LearningOS yet"
            }

            val days = JSONObject()

            for (ago in 0..6) {
                val totals = secondsForDay(ctx, ago)
                days.put(
                    Store.day(Store.dayStart(ago)),
                    JSONObject().apply { totals.forEach { (k, v) -> put(k, v) } }
                )
            }

            val body = JSONObject()
                .put("deviceId", device)
                .put("action", "put")
                .put("days", days)
                .toString()

            return try {
                val conn = URL("$server/api/usage").openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 15_000
                conn.readTimeout = 20_000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }

                val code = conn.responseCode
                conn.disconnect()

                if (code in 200..299) {
                    val stamp = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date())
                    ctx.lastSyncText = "Synced at $stamp"
                    ctx.lastSyncText
                } else {
                    "Sync failed: server answered $code"
                }
            } catch (e: Exception) {
                "Sync failed: ${e.message}"
            }
        }
    }
}
