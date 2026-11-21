package us.siqa.box

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Opens Siqa when the box powers on or the app is updated. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val i = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(i) } catch (_: Exception) {}
    }
}
