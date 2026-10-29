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

echo "Waiting for Android boot and package manager readiness."
booted=0
for attempt in $(seq 1 60); do
  if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r')" = "1" ] && \
     adb shell service check package 2>/dev/null | grep -qi "found"; then
    booted=1
    break
  fi
  sleep 2
done
if [ "$booted" -ne 1 ]; then
  echo "Android emulator did not become ready for package installation."
  adb shell getprop sys.boot_completed || true
  adb shell service check package || true
  exit 1
fi

echo "Installing APK: $APK"
installed=0
for attempt in 1 2 3; do
  if adb install -r "$APK"; then
    installed=1
    break
  fi
  echo "APK installation attempt $attempt failed; reconnecting to the emulator before retry."
  adb reconnect || true
  adb wait-for-device
  sleep $((attempt * 3))
done
if [ "$installed" -ne 1 ]; then
  echo "Could not install the debug APK after 3 attempts."
  adb logcat -d -t 200 || true
  exit 1
fi
adb logcat -c
adb shell am force-stop com.post2drive.app
adb shell monkey -p com.post2drive.app 1
sleep 20

adb shell dumpsys activity activities | grep -F "com.post2drive.app/.MainActivity"
if adb logcat -d | grep -E "chromium.*(net::ERR_|Failed to load resource)|Capacitor.*(WebView.*error|Failed to load)"; then
  echo "Detected a WebView loading error in the Android emulator."
  exit 1
fi
echo "Android APK installed and MainActivity launched on emulator."
