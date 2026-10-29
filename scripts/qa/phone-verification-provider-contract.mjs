#!/usr/bin/env node
import assert from "node:assert/strict";
import { isE164PhoneNumber, resolvePhoneRoute, isSupportedPhoneProviderName } from "../../lib/phoneVerification/provider.ts";

const originalGb = process.env.POST2DRIVE_SMS_PROVIDER_GB;
const originalIn = process.env.POST2DRIVE_SMS_PROVIDER_IN;

try {
  delete process.env.POST2DRIVE_SMS_PROVIDER_GB;
  delete process.env.POST2DRIVE_SMS_PROVIDER_IN;

  assert.equal(isE164PhoneNumber("+447700900123"), true);
  assert.equal(isE164PhoneNumber("+919876543210"), true);
  assert.equal(isE164PhoneNumber("9876543210"), false);
  assert.equal(isE164PhoneNumber("+123"), false);
  assert.equal(isE164PhoneNumber("+44 7700 900123"), false);

  const uk = resolvePhoneRoute("+447700900123");
  assert.deepEqual(
    { country: uk?.country, callingCode: uk?.callingCode, ready: uk?.ready },
    { country: "GB", callingCode: "+44", ready: false },
    "UK route remains disabled until a server adapter is registered",
  );

  const india = resolvePhoneRoute("+919876543210");
  assert.deepEqual(
    { country: india?.country, callingCode: india?.callingCode, ready: india?.ready },
    { country: "IN", callingCode: "+91", ready: false },
    "India has a separate, disabled provider slot",
  );

  process.env.POST2DRIVE_SMS_PROVIDER_GB = "example-provider";
  assert.equal(resolvePhoneRoute("+447700900123")?.providerName, "example-provider");
  assert.equal(resolvePhoneRoute("+919876543210")?.providerName, null, "provider config must not fall back across countries");

  assert.equal(resolvePhoneRoute("+14155552671"), null);
  assert.equal(resolvePhoneRoute("not-a-phone"), null);
  assert.equal(isSupportedPhoneProviderName("twilio"), true);
  assert.equal(isSupportedPhoneProviderName(""), false);
  assert.equal(isSupportedPhoneProviderName("../secret"), false);

  console.log(JSON.stringify({
    status: "passed",
    checks: 13,
    covered: ["E.164 input validation", "country calling-code routing", "disabled provider slots", "no cross-country fallback", "unknown routes fail closed", "provider-name validation"],
  }, null, 2));
} finally {
  if (originalGb === undefined) delete process.env.POST2DRIVE_SMS_PROVIDER_GB;
  else process.env.POST2DRIVE_SMS_PROVIDER_GB = originalGb;
  if (originalIn === undefined) delete process.env.POST2DRIVE_SMS_PROVIDER_IN;
  else process.env.POST2DRIVE_SMS_PROVIDER_IN = originalIn;
}
