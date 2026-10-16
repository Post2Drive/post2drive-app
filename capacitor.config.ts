import type { CapacitorConfig } from '@capacitor/cli';

// The mobile wrapper may load a deployed server only when a build-time URL is
// explicitly provided. Never bake a deleted/production environment URL into
// the app. Keep local and public builds safe by default.
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();
if (serverUrl) {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new Error('CAPACITOR_SERVER_URL must be an absolute URL.');
  }
  const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('CAPACITOR_SERVER_URL must use HTTPS except for localhost development.');
  }
}

const config: CapacitorConfig = {
  appId: 'com.post2drive.app',
  appName: 'Post2Drive',
  webDir: 'public',
  ...(serverUrl ? { server: { url: serverUrl, cleartext: serverUrl.startsWith('http://localhost') || serverUrl.startsWith('http://127.0.0.1') } } : {}),
};

export default config;
