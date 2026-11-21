package us.siqa.box

import android.Manifest
import android.annotation.SuppressLint
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Device-owner powers, saved settings and the few calls the box makes to Siqa directly. */
object Box {
    private const val PREFS = "siqa_box"

    fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    fun token(c: Context): String? = prefs(c).getString("token", null)
    fun setToken(c: Context, t: String) = prefs(c).edit().putString("token", t).apply()

    fun admin(c: Context) = ComponentName(c, AdminReceiver::class.java)
    fun dpm(c: Context) = c.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    fun isOwner(c: Context) = dpm(c).isDeviceOwnerApp(c.packageName)

    /** Runs once we're device owner: kiosk lock, stay awake, our own permissions. */
    fun applyOwnerPolicies(c: Context) {
        if (!isOwner(c)) return
        val d = dpm(c); val a = admin(c)
        try { d.setLockTaskPackages(a, arrayOf(c.packageName)) } catch (_: Exception) {}
        try {
            // Keep the screen on while plugged in (AC | USB | wireless).
            d.setGlobalSetting(a, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "7")
        } catch (_: Exception) {}
        // Location (and Nearby Wi-Fi on 13+) are needed for the setup hotspot and Wi-Fi scans.
        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.NEARBY_WIFI_DEVICES)
        for (p in perms) {
            try { d.setPermissionGrantState(a, c.packageName, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED) } catch (_: Exception) {}
        }
        if (Build.VERSION.SDK_INT >= 28) {
            try { d.setLocationEnabled(a, true) } catch (_: Exception) {}
        }
        try { d.addUserRestriction(a, android.os.UserManager.DISALLOW_FACTORY_RESET) } catch (_: Exception) {}
    }

    fun reboot(c: Context) {
        if (Build.VERSION.SDK_INT >= 24 && isOwner(c)) {
            try { dpm(c).reboot(admin(c)); return } catch (_: Exception) {}
        }
    }

    // ── Wi-Fi ──────────────────────────────────────────────────────────
    fun wifi(c: Context) = c.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    @SuppressLint("MissingPermission")
    fun currentSsid(c: Context): String? {
        val info = wifi(c).connectionInfo ?: return null
        val s = info.ssid?.trim('"') ?: return null
        return if (s == "<unknown ssid>" || s.isBlank()) null else s
    }

    fun signal(c: Context): Int? {
        val info = wifi(c).connectionInfo ?: return null
        if (info.networkId == -1) return null
        @Suppress("DEPRECATION")
        return WifiManager.calculateSignalLevel(info.rssi, 101)
    }

    /**
     * Saves a network on the box. Device owners keep the ability to add networks on new
     * Android versions. Returns the network id, or -1.
     */
    @Suppress("DEPRECATION")
    @SuppressLint("MissingPermission")
    fun saveNetwork(c: Context, ssid: String, password: String?, security: String): Int {
        val wm = wifi(c)
        if (!wm.isWifiEnabled) try { wm.isWifiEnabled = true } catch (_: Exception) {}
        val quoted = "\"$ssid\""
        try {
            wm.configuredNetworks?.filter { it.SSID == quoted }?.forEach { wm.removeNetwork(it.networkId) }
        } catch (_: Exception) {}
        val conf = WifiConfiguration().apply {
            SSID = quoted
            when {
                security == "OPEN" || password.isNullOrEmpty() -> allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
                security == "WEP" -> { wepKeys[0] = "\"$password\""; wepTxKeyIndex = 0; allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE) }
                else -> preSharedKey = "\"$password\""
            }
        }
        return try { wm.addNetwork(conf) } catch (_: Exception) { -1 }
    }

    /** Tries a network and falls back to the previous one if it can't join within ~25 s. */
    @Suppress("DEPRECATION")
    @SuppressLint("MissingPermission")
    fun joinWithFallback(c: Context, ssid: String, password: String?, security: String, source: String, done: (Boolean) -> Unit) {
        thread {
            val wm = wifi(c)
            val previous = wm.connectionInfo?.networkId ?: -1
            val id = saveNetwork(c, ssid, password, security)
            var ok = false
            if (id != -1) {
                try { wm.disconnect(); wm.enableNetwork(id, true); wm.reconnect() } catch (_: Exception) {}
                for (i in 0 until 25) {
                    Thread.sleep(1000)
                    if (currentSsid(c) == ssid && hasInternet(c)) { ok = true; break }
                }
            }
            if (!ok && previous != -1) {
                try { wm.enableNetwork(previous, true); wm.reconnect() } catch (_: Exception) {}
            }
            report(c, JSONObject().put("ssid", ssid).put("ok", ok).put("source", source).put("at", System.currentTimeMillis()))
            done(ok)
        }
    }

    /** Saves every network the admin center lists, without switching away from a working one. */
    fun syncNetworks(c: Context, json: String) {
        thread {
            try {
                val arr = JSONArray(json)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val ssid = o.optString("ssid")
                    if (ssid.isBlank()) continue
                    val id = saveNetwork(c, ssid, o.optString("password").ifBlank { null }, o.optString("security", "WPA"))
                    report(c, JSONObject().put("ssid", ssid).put("ok", id != -1).put("source", "admin").put("at", System.currentTimeMillis()))
                }
            } catch (_: Exception) {}
        }
    }

    fun hasInternet(c: Context): Boolean {
        val cm = c.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork ?: return false) ?: return false
        return caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    /** Tells the admin center what happened with Wi-Fi (screen_ack). */
    fun report(c: Context, wifiEvent: JSONObject) {
        val t = token(c) ?: return
        rpc("screen_ack", JSONObject().put("p_device_token", t).put("p_wifi_event", wifiEvent))
    }

    fun rpc(fn: String, body: JSONObject): String? = try {
        val conn = URL("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/$fn").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 8000; conn.readTimeout = 8000
        conn.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY)
        conn.setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_KEY}")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        conn.inputStream.bufferedReader().use { it.readText() }
    } catch (_: Exception) { null }
}
