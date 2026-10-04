package com.learningos.tracker

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.learningos.tracker.Store.pairedDevice
import com.learningos.tracker.Store.lastSyncText
import com.learningos.tracker.Store.pairedServer
import kotlin.concurrent.thread

class MainActivity : Activity() {

    private val bg = Color.parseColor("#07090D")
    private val ink = Color.parseColor("#F6F7F9")
    private val muted = Color.parseColor("#8D97A7")
    private val lime = Color.parseColor("#C9FF63")

    private lateinit var root: LinearLayout
    private var syncStatus = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(40))
        }

        setContentView(ScrollView(this).apply {
            setBackgroundColor(bg)
            addView(root)
        })

        handlePairing(intent)
        SyncWorker.schedule(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handlePairing(intent)
        render()
    }

    override fun onResume() {
        super.onResume()
        render()
        syncNow()
    }

    /** learningos-tracker://pair?server=https://...&device=... */
    private fun handlePairing(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "learningos-tracker") return

        val s = data.getQueryParameter("server").orEmpty()
        val d = data.getQueryParameter("device").orEmpty()

        if (s.startsWith("https://") && d.isNotBlank()) {
            pairedServer = s.trimEnd('/')
            pairedDevice = d
            syncStatus = "Connected to LearningOS"
        }
    }

    private fun usageOk() = AppUsage.hasPermission(this)

    private fun accessibilityOk(): Boolean {
        val me = ComponentName(this, SiteTimeService::class.java).flattenToString()
        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false

        return enabled.split(':').any { it.equals(me, ignoreCase = true) }
    }

    private fun render() {
        root.removeAllViews()

        text("LearningOS Tracker", 26f, ink, bold = true)
        text(
            "Measures your daily minutes on Ynet, Walla and LinkedIn and sends them to LearningOS. " +
                "It never blocks or interrupts anything.",
            14f, muted
        )

        section("1. Connect to LearningOS")
        if (pairedServer.isNotEmpty() && pairedDevice.isNotEmpty()) {
            text("✓ Connected to $pairedServer", 14f, lime)
        } else {
            text(
                "Open LearningOS on this phone → Foresight tab → \"Connect Android tracker\". " +
                    "Or type the address and code shown there:",
                14f, muted
            )
            val s = input("https://your-app.vercel.app", pairedServer)
            val d = input("Device code", pairedDevice)
            button("Save") {
                val sv = s.text.toString().trim().trimEnd('/')
                if (sv.startsWith("https://") && d.text.isNotBlank()) {
                    pairedServer = sv
                    pairedDevice = d.text.toString().trim()
                    render()
                    syncNow()
                }
            }
        }

        section("2. Usage access (LinkedIn app)")
        if (usageOk()) {
            text("✓ Allowed", 14f, lime)
        } else {
            text("Lets the tracker read how long the LinkedIn app is open.", 14f, muted)
            button("Open usage access settings") {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
        }

        section("3. Site timer (Ynet and Walla in Chrome)")
        if (accessibilityOk()) {
            text("✓ On", 14f, lime)
        } else {
            text(
                "Android blocks this for apps installed outside the Play Store until you allow it. " +
                    "First tap \"App info\", then ⋮ (top right) → \"Allow restricted settings\". " +
                    "Then tap \"Accessibility settings\" → Installed apps → LearningOS site timer → On.",
                14f, muted
            )
            button("App info") {
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(Uri.parse("package:$packageName"))
                )
            }
            button("Accessibility settings") {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }
        text(
            "Privacy: it only reads Chrome's address bar, keeps nothing but minutes per site, " +
                "and sends only those totals to your own LearningOS server.",
            12f, muted
        )

        section("Today")
        val todayView = text("Loading…", 15f, ink)
        thread {
            val today = SyncWorker.secondsForDay(this, 0)
            val label = mapOf("ynet" to "Ynet", "walla" to "Walla", "linkedin" to "LinkedIn")
            val lines = Store.SITES.joinToString("\n") { "${label[it]}: ${today.getValue(it) / 60} min" }
            runOnUiThread { todayView.text = lines }
        }

        section("Sync")
        text(syncStatus.ifEmpty { lastSyncText.ifEmpty { "Not synced yet" } }, 14f, muted)
        button("Sync now") { syncNow() }
    }

    private fun syncNow() {
        thread {
            val result = SyncWorker.sync(this)
            runOnUiThread {
                syncStatus = result
                render()
            }
        }
    }

    // ---- tiny view helpers ----

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(s: String, size: Float, color: Int, bold: Boolean = false): TextView =
        TextView(this).apply {
            text = s
            textSize = size
            setTextColor(color)
            setLineSpacing(0f, 1.25f)
            if (bold) typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(6), 0, dp(6))
            root.addView(this)
        }

    private fun section(title: String) {
        text(title, 17f, ink, bold = true).setPadding(0, dp(22), 0, dp(4))
    }

    private fun input(hint: String, value: String): EditText =
        EditText(this).apply {
            this.hint = hint
            setText(value)
            setTextColor(ink)
            setHintTextColor(muted)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            root.addView(this, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        }

    private fun button(label: String, onClick: () -> Unit) {
        Button(this).apply {
            text = label
            isAllCaps = false
            setOnClickListener { onClick() }
            root.addView(
                this,
                LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(6) }
            )
        }
    }
}
