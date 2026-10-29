#!/usr/bin/env bash
set -euo pipefail

adb wait-for-device
# The emulator action's disable-animations option already applies these settings.
# Reapplying them here races Android's settings service on some cold boots.

APK="${GITHUB_WORKSPACE}/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -s "$APK" ]; then
  echo "Expected APK not found at $APK; searching Gradle outputs."
  find "${GITHUB_WORKSPACE}/android" -type f -name "*.apk" -print
  APK="$(find "${GITHUB_WORKSPACE}/android" -type f -path "*/outputs/apk/debug/*.apk" -size +0c -print -quit)"
fi
if [ -z "${APK:-}" ] || [ ! -s "$APK" ]; then
  echo "No non-empty debug APK found under android/**/outputs/apk/debug/."
  exit 1
fi

echo "Installing APK: $APK"
if ! adb install -r "$APK"; then
  echo "Initial APK install failed; checking emulator services and retrying once."
  adb wait-for-device
  for attempt in $(seq 1 15); do
    booted="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [ "$booted" = "1" ] && adb shell pm list packages >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  # Retry only after checking Android's package manager is responding. A second
  # failure remains fatal; this does not convert an app/install failure to pass.
  adb install -r "$APK"
fi
adb logcat -c
adb shell am force-stop com.post2drive.app
# Launch the activity directly instead of using monkey. On cold GitHub-hosted
# emulator boots, monkey can trigger unrelated Android system-service ANRs before
# delivering even one event; that makes this smoke test flaky without exercising
# the app. We still verify the app activity and WebView loading logs below.
adb shell am start -W -n com.post2drive.app/.MainActivity
sleep 15

adb shell dumpsys activity activities | grep -F "com.post2drive.app/.MainActivity"
if adb logcat -d | grep -E "chromium.*(net::ERR_|Failed to load resource)|Capacitor.*(WebView.*error|Failed to load)"; then
  echo "Detected a WebView loading error in the Android emulator."
  exit 1
fi
echo "Android APK installed and MainActivity launched on emulator."
