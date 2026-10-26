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

# Fresh Android emulators can time out while the package verifier checks a
# locally built debug APK. This CI-only emulator has no Play Store/user data;
# disable ADB install verification before installing the test artifact.
adb shell settings put global verifier_verify_adb_installs 0 || true
adb shell settings put global package_verifier_enable 0 || true

echo "Installing APK: $APK"
if ! adb install -r "$APK"; then
  echo "Standard ADB install failed; retrying without streamed install after verifier settings."
  adb shell settings put global verifier_verify_adb_installs 0 || true
  adb shell settings put global package_verifier_enable 0 || true
  adb install -r --no-streaming "$APK"
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
