import { redirect } from "next/navigation";

/** Legacy in-app admin screens are retired; administration lives in the separate analytics service. */
export default function RetiredInternalAdminPage() {
  redirect("/admin-access");
}
