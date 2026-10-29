import { prisma } from "@/lib/prisma";
import { getLocalisationProfile } from "@/lib/localisation";
import { marketDateKey } from "@/lib/vehicleDates";

export type VehicleMarket = { country: string; currency: string };

export function vehicleEligibilityCutoff(market: VehicleMarket, now = new Date()) {
  const profile = getLocalisationProfile(market);
  const marketToday = marketDateKey(now, profile?.timeZone ?? "UTC");
  return { profile, dateCutoff: new Date(marketToday + "T00:00:00.000Z") };
}

/** Canonical database predicate for an eligible carrier vehicle. */
export function vehicleEligibilityWhere(market: VehicleMarket, vehicleType?: string) {
  const { profile, dateCutoff } = vehicleEligibilityCutoff(market);
  return {
    ...(vehicleType ? { vehicleType } : {}),
    verificationStatus: "verified" as const,
    insuranceValidUntil: { gte: dateCutoff },
    ...(profile?.inspectionRequiredAtCountryLevel ? { motValidUntil: { gte: dateCutoff } } : {}),
  };
}

export function isVehicleCurrentlyEligible(
  vehicle: { vehicleType?: string; verificationStatus: string; insuranceValidUntil: Date | null; motValidUntil: Date | null },
  market: VehicleMarket,
  requiredType?: string,
  now = new Date(),
) {
  const { profile, dateCutoff } = vehicleEligibilityCutoff(market, now);
  return vehicle.verificationStatus === "verified" &&
    (!requiredType || vehicle.vehicleType === requiredType) &&
    vehicle.insuranceValidUntil !== null &&
    vehicle.insuranceValidUntil >= dateCutoff &&
    (!profile?.inspectionRequiredAtCountryLevel || (vehicle.motValidUntil !== null && vehicle.motValidUntil >= dateCutoff));
}

export async function getEligibleVehicleTypes(accountId: string, market: VehicleMarket) {
  const vehicles = await prisma.vehicle.findMany({ where: { accountId, ...vehicleEligibilityWhere(market) }, select: { vehicleType: true } });
  return [...new Set(vehicles.map((vehicle) => vehicle.vehicleType))];
}

export async function hasEligibleVehicleForJob(accountId: string, market: VehicleMarket, vehicleType: string) {
  const vehicle = await prisma.vehicle.findFirst({ where: { accountId, ...vehicleEligibilityWhere(market, vehicleType) }, select: { id: true } });
  return vehicle !== null;
}

/** India uses verified phone ownership as its sole platform verification gate. */
export function isIndiaPhoneVerifiedAccount(account: {
  country?: string | null;
  currency?: string | null;
  phoneVerifiedAt?: Date | string | null;
}) {
  return account.country === "IN" && account.currency === "INR" && Boolean(account.phoneVerifiedAt);
}

/** Posting and awarding a bid require the market's applicable verification policy. */
export function canPostJobs(account: { verificationStatus: string; companyVerificationStatus: string; country?: string | null; currency?: string | null; phoneVerifiedAt?: Date | string | null }) {
  if (isIndiaPhoneVerifiedAccount(account)) return true;
  return account.verificationStatus === "verified" && account.companyVerificationStatus === "verified";
}
