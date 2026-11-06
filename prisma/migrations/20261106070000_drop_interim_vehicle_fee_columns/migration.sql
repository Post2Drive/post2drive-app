-- 20261106040000 (already on main) added interim per-vehicle fee columns.
-- Extra-vehicle fees are now recorded as VerificationFee lines (lib/verification.ts
-- recordVehicleAddedFees), so these columns are unused. IF EXISTS keeps this safe
-- whether or not the earlier migration has run.
ALTER TABLE "Vehicle"
  DROP COLUMN IF EXISTS "additionalVehicleFeeMinorUnits",
  DROP COLUMN IF EXISTS "additionalVehicleFeeCurrency",
  DROP COLUMN IF EXISTS "additionalVehicleFeeStatus";
