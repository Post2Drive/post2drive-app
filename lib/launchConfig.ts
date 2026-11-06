import { prisma } from "@/lib/prisma";
import { checkLaunchConfig, type LaunchConfigCheck } from "@/lib/launchWindows";

/**
 * Read the operator-managed launch windows. Never creates or defaults a row: a missing or
 * invalid configuration fails closed (no free windows) and is surfaced via `issue`.
 */
export async function getLaunchConfig(): Promise<LaunchConfigCheck> {
  const row = await prisma.launchConfig.findUnique({ where: { id: "global" } });
  const checked = checkLaunchConfig(row);
  if (checked.status !== "ok") {
    console.error("Launch configuration unavailable; free launch windows are disabled.", { status: checked.status });
  }
  return checked;
}
