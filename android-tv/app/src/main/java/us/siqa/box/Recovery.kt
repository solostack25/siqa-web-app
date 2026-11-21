package us.siqa.box

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import kotlin.concurrent.thread

/**
 * Wi-Fi recovery when the box can't get online: it opens a temporary hotspot, the TV shows
 * a QR code to join it, and a small setup page lets someone pick the masjid's network and
 * type the password from their phone. The box tests the network before keeping it.
 */
class Recovery(private val ctx: Context, private val ui: Listener) {
    interface Listener {
        fun showJoin(ssid: String, password: String, joinQr: Bitmap, pageUrl: String, pageQr: Bitmap, pin: String)
        fun showStatus(text: String)
        fun recovered()
    }

    private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
    private var server: ServerSocket? = null
    private val main = Handler(Looper.getMainLooper())
    private val pin = (1000..9999).random().toString()
    @Volatile private var running = false

    @SuppressLint("MissingPermission")
    fun start() {
        if (running) return
        running = true
        ui.showStatus("Siqa lost its internet connection. Starting Wi-Fi setup…")
        try {
            Box.wifi(ctx).startLocalOnlyHotspot(object : WifiManager.LocalOnlyHotspotCallback() {
                override fun onStarted(r: WifiManager.LocalOnlyHotspotReservation) {
                    reservation = r
                    val (ssid, pass) = creds(r)
                    thread { serve() }
                    // The hotspot interface takes a moment to get its address.
                    main.postDelayed({
                        val url = "http://${hotspotIp() ?: "192.168.43.1"}:8080/"
                        val join = "WIFI:T:WPA;S:${esc(ssid)};P:${esc(pass)};;"
                        ui.showJoin(ssid, pass, qr(join), url, qr(url), pin)
                    }, 1500)
                }
                override fun onFailed(reason: Int) {
                    ui.showStatus("Couldn't start Wi-Fi setup on this box (code $reason). Plug in an Ethernet cable, or restart the box.")
                    running = false
                }
            }, main)
        } catch (e: Exception) {
            ui.showStatus("Couldn't start Wi-Fi setup: ${e.message}. Plug in an Ethernet cable, or restart the box.")
            running = false
        }
    }

    fun stop() {
        running = false
        try { reservation?.close() } catch (_: Exception) {}
        reservation = null
        try { server?.close() } catch (_: Exception) {}
        server = null
    }

    @Suppress("DEPRECATION")
    private fun creds(r: WifiManager.LocalOnlyHotspotReservation): Pair<String, String> {
        if (Build.VERSION.SDK_INT >= 30) {
            val c = r.softApConfiguration
            return Pair(c.ssid ?: "Siqa-setup", c.passphrase ?: "")
        }
        val c = r.wifiConfiguration
        return Pair(c?.SSID?.trim('"') ?: "Siqa-setup", c?.preSharedKey?.trim('"') ?: "")
    }

    private fun hotspotIp(): String? = try {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback && (it.name.startsWith("wlan") || it.name.startsWith("ap") || it.name.startsWith("swlan")) }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .map { it.hostAddress }
            .firstOrNull { it.startsWith("192.168.") || it.startsWith("10.") || it.startsWith("172.") }
    } catch (_: Exception) { null }

    // ── A tiny setup page ──────────────────────────────────────────────
    private fun serve() {
        try {
            val s = ServerSocket(8080)
            server = s
            while (running) {
                val sock = try { s.accept() } catch (_: Exception) { break }
                thread { handle(sock) }
            }
        } catch (_: Exception) {}
    }

    private fun handle(sock: Socket) {
        sock.use { so ->
            val input = so.getInputStream().bufferedReader()
            val first = input.readLine() ?: return
            var len = 0
            while (true) {
                val l = input.readLine() ?: break
                if (l.isEmpty()) break
                if (l.lowercase().startsWith("content-length:")) len = l.substring(15).trim().toIntOrNull() ?: 0
            }
            val out = so.getOutputStream()
            if (first.startsWith("POST")) {
                val buf = CharArray(len); var read = 0
                while (read < len) { val n = input.read(buf, read, len - read); if (n < 0) break; read += n }
                val form = String(buf, 0, read).split("&").associate {
                    val kv = it.split("=", limit = 2)
                    URLDecoder.decode(kv[0], "UTF-8") to URLDecoder.decode(kv.getOrElse(1) { "" }, "UTF-8")
                }
                if (form["pin"] != pin) { respond(out, page(error = "That PIN doesn't match the one on the TV.")); return }
                val ssid = (form["ssid_other"]?.takeIf { it.isNotBlank() } ?: form["ssid"]).orEmpty()
                if (ssid.isBlank()) { respond(out, page(error = "Pick a network.")); return }
                respond(out, html("<h1>Connecting to ${h(ssid)}…</h1><p>Watch the TV. If it can't join, it comes back here so you can try again.</p>"))
                main.post { ui.showStatus("Joining $ssid…") }
                stop()
                Box.joinWithFallback(ctx, ssid, form["password"], if (form["password"].isNullOrEmpty()) "OPEN" else "WPA", "tv") { ok ->
                    main.post {
                        if (ok) { ui.showStatus("Connected to $ssid"); ui.recovered() }
                        else { ui.showStatus("Couldn't join $ssid. Check the password and scan again."); main.postDelayed({ start() }, 4000) }
                    }
                }
            } else {
                respond(out, page())
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun page(error: String? = null): String {
        val nets = try {
            Box.wifi(ctx).scanResults.map { it.SSID }.filter { it.isNotBlank() }.distinct().sorted()
        } catch (_: Exception) { emptyList() }
        val options = nets.joinToString("") { "<option>${h(it)}</option>" }
        return html("""
            <h1>Set up Wi-Fi for Siqa</h1>
            ${if (error != null) "<p class=err>${h(error)}</p>" else ""}
            <form method=post>
              <label>Network</label>
              <select name=ssid><option value="">Choose…</option>$options</select>
              <label>Or type the network name</label>
              <input name=ssid_other autocomplete=off>
              <label>Password</label>
              <input name=password type=password autocomplete=off>
              <label>PIN shown on the TV</label>
              <input name=pin inputmode=numeric maxlength=4 required>
              <button>Connect</button>
            </form>
        """)
    }

    private fun html(body: String) = """<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1">
        <title>Siqa Wi-Fi setup</title><style>
        body{font:16px system-ui,sans-serif;background:#fff;color:#111;margin:0;padding:24px;max-width:460px}
        h1{font-size:26px;margin:8px 0 16px} label{display:block;font-weight:600;color:#5e5e5e;margin:16px 0 6px;font-size:13px}
        input,select{width:100%;box-sizing:border-box;height:48px;border-radius:12px;border:0;background:#f2f2f0;padding:0 12px;font-size:16px}
        button{margin-top:24px;width:100%;height:54px;border:0;border-radius:16px;background:#111;color:#fff;font-size:16px;font-weight:700}
        .err{background:#fbedea;color:#b4412c;padding:12px;border-radius:12px}</style></head><body>$body</body></html>"""

    private fun respond(out: java.io.OutputStream, body: String) {
        val bytes = body.toByteArray()
        out.write("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
        out.write(bytes); out.flush()
    }

    companion object {
        fun h(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
        fun esc(s: String) = s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace(":", "\\:").replace("\"", "\\\"")
        fun qr(text: String, size: Int = 520): Bitmap {
            val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
            val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
            for (x in 0 until size) for (y in 0 until size) bmp.setPixel(x, y, if (m[x, y]) Color.parseColor("#0A0F1C") else Color.WHITE)
            return bmp
        }
    }
}
