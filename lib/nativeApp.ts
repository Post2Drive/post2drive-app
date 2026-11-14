/**
 * Is the site running inside the Post2Drive store app (the Capacitor wrapper)
 * rather than an ordinary browser?
 *
 * Plans are bought on the website only. Inside the store apps nothing is sold
 * and nothing points to a place to pay, which is what keeps the app within the
 * Google Play and App Store payment rules without using their billing systems.
 * See docs/STORE_READINESS.md ("Subscription payments").
 */
type CapacitorBridge = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function isStoreApp(win: unknown): boolean {
  const bridge = (win as { Capacitor?: CapacitorBridge } | null | undefined)?.Capacitor;
  if (!bridge) return false;
  try {
    if (typeof bridge.isNativePlatform === "function") return bridge.isNativePlatform() === true;
    if (typeof bridge.getPlatform === "function") return ["android", "ios"].includes(bridge.getPlatform());
  } catch {
    // An unreadable bridge is treated as the store app: hiding Pay is the safe side.
    return true;
  }
  return false;
}
