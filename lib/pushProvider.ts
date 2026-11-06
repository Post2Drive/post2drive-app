import type { PushNotificationProvider } from "@/lib/providerContracts";

/**
 * No push provider (FCM/APNs/web push) is connected. Returning null means
 * "not configured": notify() still stores the in-app notification and skips
 * the push step. Register a real adapter here only together with its device-
 * token storage and delivery tests.
 */
export function getPushProvider(): PushNotificationProvider | null {
  return null;
}
