import { spawn } from "node:child_process";

if (process.env.NODE_ENV !== "production") {
  console.error("Refusing to start the deployed application unless NODE_ENV=production. Use npm run dev for local development.");
  process.exit(1);
}

const dashboardEnabled = process.env.ENABLE_EMBEDDED_OPS_DASHBOARD === "true";
const appPort = String(process.env.PORT || 3000);
const children = [];

function launch(command, args, env, label) {
  const child = spawn(command, args, { stdio: "inherit", env });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(label + " exited unexpectedly", { code, signal });
    shutdown(code ?? 1);
  });
  return child;
}
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
  const timer = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); process.exit(code); }, 8000);
  timer.unref();
}
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

if (dashboardEnabled) {
  if (!process.env.OPS_DASHBOARD_DATABASE_URL) {
    console.error("OPS_DASHBOARD_DATABASE_URL is required when embedded dashboard is enabled.");
    process.exit(1);
  }
  launch(process.execPath, ["ops-dashboard/server.mjs"], { ...process.env, PORT: "3101" }, "Ops dashboard");
}
launch(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", appPort], process.env, "Next.js app");
