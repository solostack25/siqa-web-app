# Siqa box (Android TV)

A small native shell: the box boots straight into siqa.us/screen in a full-screen web view.
That page shows the masjid screen or Siqa Home, depending on how the box was linked.

## Get the APK
Actions → **TV box APK** → latest run → Artifacts → `siqa-box-apk`.

## Set up a box at your desk (once, ~5 minutes)
Do this on a fresh or factory-reset box, **before signing into any Google account**
(device owner can only be set when the box has no accounts).

1. On the box: Settings → About → tap Build 7 times → Developer options → USB debugging on.
2. On your computer, with the box plugged in over USB (or `adb connect <box-ip>`):
   ```
   adb install -r siqa-box.apk
   adb shell dpm set-device-owner us.siqa.box/.AdminReceiver
   adb shell cmd package set-home-activity us.siqa.box/.MainActivity
   adb reboot
   ```
3. It reboots into Siqa and shows a 6-digit code. Add it in Siqa for Masjids → Screens
   (or scan the QR to link it to a home).

Optional: connect it to the masjid's Wi-Fi now, or plug in Ethernet on site.

## What the box does
- Opens Siqa on boot and keeps it pinned (Home and Recents can't leave it).
- Keeps the screen on; turns the screen off/on on the schedule set in the admin center.
- Restart and reload from the admin center.
- Saves Wi-Fi networks the admin center sends, testing a new one before switching.
- If it's offline for 2 minutes: opens a temporary hotspot and shows two QR codes on the TV.
  Scan one to join the box's hotspot, the other to open its setup page, pick the masjid's
  Wi-Fi, type the password and the PIN on the TV.
- Back on the remote never leaves Siqa; in Siqa Home it closes a video.

## Known limits
- Android doesn't let regular apps send HDMI-CEC, so "TV off" sleeps the box; most TVs
  then go to standby or "no signal". True CEC needs a box with signage firmware.
- Updates: install a newer APK the same way (`adb install -r`). Remote updates from the
  admin center come next.
