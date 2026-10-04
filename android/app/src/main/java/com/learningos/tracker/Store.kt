package com.learningos.tracker

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Local per-day totals for browser time, plus pairing settings. */
object Store {

    val SITES = listOf("ynet", "walla", "linkedin")

    private const val PREFS = "tracker"

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun day(ms: Long): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(ms))

    /** Start of the local day that is [daysAgo] days before today. */
    fun dayStart(daysAgo: Int): Long =
        Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, -daysAgo)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    /** Maps a Chrome address-bar value to a tracked site, or null. */
    fun siteFor(url: CharSequence?): String? {
        val host = url?.toString()
            ?.trim()
            ?.lowercase(Locale.US)
            ?.substringAfter("://")
            ?.substringBefore('/')
            ?.substringBefore('?')
            ?: return null

        return when {
            host == "ynet.co.il" || host.endsWith(".ynet.co.il") ||
                host == "ynetnews.com" || host.endsWith(".ynetnews.com") -> "ynet"
            host == "walla.co.il" || host.endsWith(".walla.co.il") -> "walla"
            host == "linkedin.com" || host.endsWith(".linkedin.com") -> "linkedin"
            else -> null
        }
    }

    /** Adds browser time on [site], split across midnight if needed. */
    @Synchronized
    fun addWeb(ctx: Context, site: String, from: Long, to: Long) {
        if (to <= from) return

        val p = prefs(ctx)
        val e = p.edit()
        var start = from

        while (start < to) {
            val cal = Calendar.getInstance().apply {
                timeInMillis = start
                add(Calendar.DAY_OF_YEAR, 1)
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val end = minOf(to, cal.timeInMillis)
            val key = "web|${day(start)}|$site"
            e.putLong(key, p.getLong(key, 0L) + (end - start))
            start = end
        }

        e.apply()
    }

    fun webMs(ctx: Context, day: String, site: String): Long =
        prefs(ctx).getLong("web|$day|$site", 0L)

    var Context.server: String
        get() = prefs(this).getString("server", "") ?: ""
        set(v) = prefs(this).edit().putString("server", v).apply()

    var Context.deviceId: String
        get() = prefs(this).getString("deviceId", "") ?: ""
        set(v) = prefs(this).edit().putString("deviceId", v).apply()

    var Context.lastSync: String
        get() = prefs(this).getString("lastSync", "") ?: ""
        set(v) = prefs(this).edit().putString("lastSync", v).apply()
}
