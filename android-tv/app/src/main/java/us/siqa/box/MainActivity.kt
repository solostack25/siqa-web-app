package us.siqa.box

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/**
 * The Siqa box. A full-screen web view of siqa.us/screen, which shows the masjid screen
 * or Siqa Home depending on how the box was linked. The page talks to the box through
 * window.SiqaBox (token, device info, reboot, Wi-Fi, screen power).
 */
class MainActivity : Activity(), Recovery.Listener {
    private lateinit var web: WebView
    private lateinit var overlay: LinearLayout
    private lateinit var status: TextView
    private lateinit var qrJoin: ImageView
    private lateinit var qrPage: ImageView
    private lateinit var help: TextView
    private val main = Handler(Looper.getMainLooper())
    private var recovery: Recovery? = null
    private var offlineSince = 0L

    private val startUrl get() = "${BuildConfig.SITE}/screen?box=1&v=${BuildConfig.VERSION_CODE}"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_FULLSCREEN)
        Box.applyOwnerPolicies(this)

        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0A0F1C")) }
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0A0F1C"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            settings.userAgentString = settings.userAgentString + " SiqaBox/${BuildConfig.VERSION_NAME}"
            isFocusable = true
            isFocusableInTouchMode = true
            addJavascriptInterface(Bridge(), "SiqaBox")
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    // Stay on Siqa (and the players it embeds); never open other apps.
                    val host = req.url.host ?: return true
                    return !(host.endsWith("siqa.us") || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com") || host.endsWith("vercel.app") || host.endsWith("cloudflarestream.com"))
                }
                override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                    if (req.isForMainFrame) main.postDelayed({ view.reload() }, 15000)
                }
            }
        }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        buildOverlay(root)
        setContentView(root)
        immersive()
        web.loadUrl(startUrl)
        watchNetwork()
        startPowerTicker()
    }

    override fun onResume() {
        super.onResume()
        immersive()
        // Kiosk: as device owner, pin Siqa so Home/Recents can't leave it.
        if (Box.isOwner(this)) try { startLockTask() } catch (_: Exception) {}
    }

    private fun immersive() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
    }

    // Back on the remote goes to the page (closes a video in Siqa Home); it never leaves Siqa.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))", null)
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { /* handled in dispatchKeyEvent */ }

    // ── Network watch → Wi-Fi recovery after 2 minutes offline ──────────
    private fun watchNetwork() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) {
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) main.post { online() }
            }
            override fun onLost(n: Network) { main.post { if (!Box.hasInternet(this@MainActivity)) offlineSince = System.currentTimeMillis() } }
        })
        if (!Box.hasInternet(this)) offlineSince = System.currentTimeMillis()
        val tick = object : Runnable {
            override fun run() {
                if (Box.hasInternet(this@MainActivity)) online()
                else {
                    if (offlineSince == 0L) offlineSince = System.currentTimeMillis()
                    if (System.currentTimeMillis() - offlineSince > 120_000 && recovery == null) {
                        recovery = Recovery(this@MainActivity, this@MainActivity).also { it.start() }
                    }
                }
                main.postDelayed(this, 10_000)
            }
        }
        main.postDelayed(tick, 10_000)
    }

    private fun online() {
        offlineSince = 0L
        if (recovery != null) { recovery?.stop(); recovery = null; recovered() }
    }

    // ── Recovery overlay (native, so it works with no internet at all) ──
    private fun buildOverlay(root: FrameLayout) {
        overlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0A0F1C"))
            visibility = View.GONE
            setPadding(80, 60, 80, 60)
        }
        val dm: DisplayMetrics = resources.displayMetrics
        val big = (dm.widthPixels / 1920f).coerceAtLeast(0.5f)
        val title = TextView(this).apply {
            text = "Wi-Fi setup"
            setTextColor(Color.parseColor("#EDF1F7")); textSize = 34f * big; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        }
        status = TextView(this).apply { setTextColor(Color.parseColor("#9FACC4")); textSize = 20f * big; gravity = Gravity.CENTER; setPadding(0, 16, 0, 32) }
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        val qs = (dm.heightPixels * 0.38f).toInt()
        qrJoin = ImageView(this).apply { layoutParams = LinearLayout.LayoutParams(qs, qs).apply { marginEnd = 80 } }
        qrPage = ImageView(this).apply { layoutParams = LinearLayout.LayoutParams(qs, qs) }
        row.addView(qrJoin); row.addView(qrPage)
        help = TextView(this).apply { setTextColor(Color.parseColor("#E6C290")); textSize = 18f * big; gravity = Gravity.CENTER; setPadding(0, 32, 0, 0) }
        overlay.addView(title); overlay.addView(status); overlay.addView(row); overlay.addView(help)
        root.addView(overlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    override fun showJoin(ssid: String, password: String, joinQr: Bitmap, pageUrl: String, pageQr: Bitmap, pin: String) {
        overlay.visibility = View.VISIBLE
        status.text = "Siqa can't reach the internet. Use your phone to give it the masjid's Wi-Fi."
        qrJoin.setImageBitmap(joinQr)
        qrPage.setImageBitmap(pageQr)
        help.text = "1. Scan the left code to join \"$ssid\".   2. Scan the right code (or open $pageUrl).   3. Pick the network, type the password and PIN $pin."
    }

    override fun showStatus(text: String) {
        overlay.visibility = View.VISIBLE
        status.text = text
    }

    override fun recovered() {
        overlay.visibility = View.GONE
        qrJoin.setImageDrawable(null); qrPage.setImageDrawable(null)
        web.loadUrl(startUrl)
    }

    // ── window.SiqaBox ──────────────────────────────────────────────────
    inner class Bridge {
        @JavascriptInterface fun getToken(): String? = Box.token(this@MainActivity)
        @JavascriptInterface fun setToken(t: String) { Box.setToken(this@MainActivity, t) }
        @JavascriptInterface fun info(): String {
            val dm = resources.displayMetrics
            return JSONObject()
                .put("app", "box")
                .put("version", BuildConfig.VERSION_NAME)
                .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                .put("android", Build.VERSION.RELEASE)
                .put("owner", Box.isOwner(this@MainActivity))
                .put("ssid", Box.currentSsid(this@MainActivity) ?: JSONObject.NULL)
                .put("signal", Box.signal(this@MainActivity) ?: JSONObject.NULL)
                .put("resolution", "${dm.widthPixels}x${dm.heightPixels}")
                .toString()
        }
        @JavascriptInterface fun reboot() { main.post { Box.reboot(this@MainActivity); web.reload() } }
        @JavascriptInterface fun syncWifi(json: String) { Box.syncNetworks(this@MainActivity, json) }
        @JavascriptInterface fun setMode(mode: String) { Box.prefs(this@MainActivity).edit().putString("mode", mode).apply() }

        /**
         * Power schedule, e.g. on "05:00", off "23:00" in the masjid's timezone (empty = always on).
         * Android doesn't let regular apps send HDMI-CEC directly, so "off" sleeps the box (most TVs
         * then go to standby or show "no signal") and "on" wakes it. The box keeps the schedule
         * itself, because the page is paused while the screen is asleep.
         */
        @JavascriptInterface fun setPowerSchedule(on: String?, off: String?, tz: String?) {
            Box.prefs(this@MainActivity).edit().putString("power_on", on ?: "").putString("power_off", off ?: "").putString("tz", tz ?: "").apply()
        }
    }

    private fun startPowerTicker() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        // The box is always plugged in; a partial wake lock keeps the schedule running while the screen sleeps.
        try { pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "siqa:schedule").acquire() } catch (_: Exception) {}
        val tick = object : Runnable {
            override fun run() {
                val p = Box.prefs(this@MainActivity)
                val on = p.getString("power_on", "") ?: ""; val off = p.getString("power_off", "") ?: ""
                if (on.length >= 5 && off.length >= 5) {
                    val tz = java.util.TimeZone.getTimeZone(p.getString("tz", "").takeUnless { it.isNullOrEmpty() } ?: java.util.TimeZone.getDefault().id)
                    val cal = java.util.Calendar.getInstance(tz)
                    val cur = String.format("%02d:%02d", cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE))
                    val a = on.substring(0, 5); val b = off.substring(0, 5)
                    val awake = if (a < b) cur >= a && cur < b else !(cur >= b && cur < a)
                    val screenOn = pm.isInteractive
                    if (awake && !screenOn) {
                        @Suppress("DEPRECATION")
                        pm.newWakeLock(PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "siqa:wake").acquire(10_000)
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        web.reload()
                    } else if (!awake && screenOn) {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        if (Box.isOwner(this@MainActivity)) try { Box.dpm(this@MainActivity).lockNow() } catch (_: Exception) {}
                    }
                }
                main.postDelayed(this, 30_000)
            }
        }
        main.postDelayed(tick, 30_000)
    }
}
