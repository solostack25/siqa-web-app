package us.siqa.box

import android.app.admin.DeviceAdminReceiver

/** Lets Siqa be the box's device owner (kiosk lock, silent Wi-Fi changes, reboot). */
class AdminReceiver : DeviceAdminReceiver()
