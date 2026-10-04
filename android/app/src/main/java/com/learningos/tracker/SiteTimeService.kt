package com.learningos.tracker

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent

/**
 * Times visits to the tracked sites in Chrome by reading Chrome's address bar.
 * Android only delivers Chrome's events to this service (see
 * accessibility_config.xml), and it never acts on the screen; it only keeps
 * minutes per site.
 */
class SiteTimeService : AccessibilityService() {

    private val chrome = "com.android.chrome"
    private val urlBarId = "com.android.chrome:id/url_bar"

    // Stop counting after this long with no activity in Chrome (reading
    // without scrolling, phone left on the table...).
    private val idleMs = 3 * 60_000L

    private var current: String? = null
    private var since = 0L
    private var lastActivity = 0L
    private var lastCheck = 0L

    private val handler = Handler(Looper.getMainLooper())

    // Only Chrome's events reach us, so leaving Chrome is noticed by polling.
    private val tick = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()

            if (current != null && !chromeInFront()) {
                switchTo(null, now)
            } else {
                checkpoint(now)
            }

            handler.postDelayed(this, 15_000L)
        }
    }

    private val screenOff = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            switchTo(null, System.currentTimeMillis())
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        registerReceiver(screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF))
        handler.postDelayed(tick, 15_000L)
        SyncWorker.schedule(this)
    }

    private fun chromeInFront(): Boolean =
        try {
            rootInActiveWindow?.packageName?.toString() == chrome
        } catch (e: Exception) {
            false
        }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.packageName?.toString() != chrome) return

        val now = System.currentTimeMillis()
        val windowChange = event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
        lastActivity = now

        // Chrome fires many content events; looking at the address bar about
        // once a second is plenty.
        if (!windowChange && now - lastCheck < 1000L) return
        lastCheck = now

        val root = try {
            rootInActiveWindow
        } catch (e: Exception) {
            null
        } ?: return

        if (root.packageName?.toString() != chrome) {
            switchTo(null, now)
            return
        }

        val bar = root.findAccessibilityNodeInfosByViewId(urlBarId).firstOrNull()

        // The bar is hidden while scrolling a page: keep the current site.
        if (bar?.text != null) {
            switchTo(Store.siteFor(bar.text), now)
        }
    }

    private fun switchTo(site: String?, now: Long) {
        if (site == current) return
        flush(now)
        current = site
        since = now
        if (site != null) lastActivity = now
    }

    private fun flush(now: Long) {
        val site = current ?: return
        val end = minOf(now, lastActivity + idleMs)
        Store.addWeb(this, site, since, end)
        since = now
    }

    /** Saves the running visit regularly so a killed service loses little. */
    private fun checkpoint(now: Long) {
        if (current == null) return

        if (now - lastActivity > idleMs) {
            switchTo(null, now)
        } else {
            flush(now)
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        flush(System.currentTimeMillis())
        current = null
        handler.removeCallbacks(tick)
        try {
            unregisterReceiver(screenOff)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }
}
