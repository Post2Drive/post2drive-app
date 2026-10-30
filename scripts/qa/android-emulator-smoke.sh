#!/usr/bin/env bash
set -euo pipefail

adb wait-for-device
# Do not change global animation settings here; that can race Android services
# during cold boots on GitHub-hosted emulators.

wait_for_android_services() {
  adb wait-for-device
  for attempt in $(seq 1 30); do
    booted="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [ "$booted" = "1" ] &&
      adb shell pm list packages >/dev/null 2>&1 &&
      adb shell dumpsys activity activities >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Android package/activity services did not become responsive."
  return 1
}

run_activity_manager() {
  if adb shell am "$@"; then
    return 0
  fi
  echo "Activity Manager command failed; waiting for Android services and retrying once."
  wait_for_android_services
  adb shell am "$@"
}

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
  wait_for_android_services
  # Retry only after checking Android's package manager is responding. A second
  # failure remains fatal; this does not convert an app/install failure to pass.
  adb install -r "$APK"
fi

if ! adb logcat -c; then
  echo "Logcat clear failed; waiting for Android services and retrying once."
  wait_for_android_services
  adb logcat -c
fi

# -S asks Activity Manager to force-stop the app before launching it, avoiding
# a separate force-stop command and reducing the number of cold-boot service calls.
# A transient Binder/ADB broken pipe gets one bounded service-readiness retry.
run_activity_manager start -W -S -n com.post2drive.app/.MainActivity
sleep 15

activity_dump="$(adb shell dumpsys activity activities)" || {
  echo "Activity state read failed; waiting for Android services and retrying once."
  wait_for_android_services
  activity_dump="$(adb shell dumpsys activity activities)"
}
printf '%s\n' "$activity_dump" | grep -F "com.post2drive.app/.MainActivity"

logcat_output="$(adb logcat -d)" || {
  echo "Logcat read failed; waiting for Android services and retrying once."
  wait_for_android_services
  logcat_output="$(adb logcat -d)"
}
if printf '%s\n' "$logcat_output" | grep -E "chromium.*(net::ERR_|Failed to load resource)|Capacitor.*(WebView.*error|Failed to load)"; then
  echo "Detected a WebView loading error in the Android emulator."
  exit 1
fi
echo "Android APK installed and MainActivity launched on emulator."
