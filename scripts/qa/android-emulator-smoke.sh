#!/usr/bin/env bash
set -euo pipefail

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

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
adb install -r "$APK"
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
