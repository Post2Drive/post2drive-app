export const PILOT_DIAGNOSTICS_STORAGE_KEY = "post2drive:pilot-diagnostics:v1";

export type PilotDiagnostics = {
  capturedAt: string;
  route: string;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  horizontalOverflowPx: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  orientation: string;
  colorDepth: number;
  language: string;
  timezone: string;
  userAgent: string;
  platform: string;
  online: boolean;
  standalone: boolean;
  nativeShell: boolean;
  visualViewportWidth: number | null;
  visualViewportHeight: number | null;
  visualViewportScale: number | null;
  safeAreaTop: number;
  safeAreaBottom: number;
  reducedMotion: boolean;
  colorScheme: string;
};

function safeRoute(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => /^[a-z0-9_-]{18,}$/i.test(segment) ? ":id" : segment)
    .join("/")
    .slice(0, 180);
}

/** Capture layout/device diagnostics only after the pilot tester asks to report an issue. */
export function collectPilotDiagnostics(): PilotDiagnostics {
  const vv = window.visualViewport;
  let safeAreaTop = 0;
  let safeAreaBottom = 0;
  try {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);";
    document.body.appendChild(probe);
    const styles = window.getComputedStyle(probe);
    safeAreaTop = Number.parseFloat(styles.paddingTop) || 0;
    safeAreaBottom = Number.parseFloat(styles.paddingBottom) || 0;
    probe.remove();
  } catch {
    // Safe-area values are best-effort diagnostics; the report still works.
  }
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const root = document.documentElement;
  return {
    capturedAt: new Date().toISOString(),
    route: safeRoute(window.location.pathname),
    viewportWidth: Math.round(window.innerWidth),
    viewportHeight: Math.round(window.innerHeight),
    documentWidth: Math.round(root.scrollWidth),
    documentHeight: Math.round(root.scrollHeight),
    horizontalOverflowPx: Math.max(0, Math.round(root.scrollWidth - root.clientWidth)),
    screenWidth: Math.round(window.screen.width),
    screenHeight: Math.round(window.screen.height),
    devicePixelRatio: Number.isFinite(window.devicePixelRatio) ? Math.round(window.devicePixelRatio * 100) / 100 : 1,
    orientation: window.screen.orientation?.type || (window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape"),
    colorDepth: window.screen.colorDepth || 0,
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    userAgent: (navigator.userAgent || "").slice(0, 400),
    platform: (uaData?.platform || navigator.platform || "unknown").slice(0, 100),
    online: navigator.onLine,
    standalone: window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    nativeShell: Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()),
    visualViewportWidth: vv ? Math.round(vv.width) : null,
    visualViewportHeight: vv ? Math.round(vv.height) : null,
    visualViewportScale: vv ? Math.round(vv.scale * 100) / 100 : null,
    safeAreaTop,
    safeAreaBottom,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  };
}
