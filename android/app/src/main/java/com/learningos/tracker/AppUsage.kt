package com.learningos.tracker

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process

/** Foreground time in the tracked apps (LinkedIn, and Ynet/Walla apps if installed). */
object AppUsage {

    fun hasPermission(ctx: Context): Boolean {
        val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager

        @Suppress("DEPRECATION")
        val mode = ops.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            ctx.packageName
        )

        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun siteForPackage(pkg: String): String? {
        val p = pkg.lowercase()
        return when {
            p.startsWith("com.android.chrome") -> null
            "linkedin" in p -> "linkedin"
            "ynet" in p -> "ynet"
            "walla" in p -> "walla"
            else -> null
        }
    }

    /** Milliseconds per site for the local day [daysAgo] days before today. */
    fun msForDay(ctx: Context, daysAgo: Int): Map<String, Long> {
        val totals = Store.SITES.associateWith { 0L }.toMutableMap()

        if (!hasPermission(ctx)) return totals

        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val start = Store.dayStart(daysAgo)
        val end = minOf(Store.dayStart(daysAgo - 1), System.currentTimeMillis())
        val events = usm.queryEvents(start, end)
        val ev = UsageEvents.Event()
        val openSince = HashMap<String, Long>()

        while (events.hasNextEvent()) {
            events.getNextEvent(ev)
            val site = siteForPackage(ev.packageName ?: continue) ?: continue

            @Suppress("DEPRECATION")
            when (ev.eventType) {
                UsageEvents.Event.MOVE_TO_FOREGROUND ->
                    openSince[ev.packageName] = ev.timeStamp

                UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                    // An app already open at midnight counts from the start of the day.
                    val from = openSince.remove(ev.packageName) ?: start
                    totals[site] = totals.getValue(site) + (ev.timeStamp - from)
                }
            }
        }

        // Still open now (or at the end of that day).
        for ((pkg, from) in openSince) {
            val site = siteForPackage(pkg) ?: continue
            totals[site] = totals.getValue(site) + (end - from)
        }

        return totals
    }
}
