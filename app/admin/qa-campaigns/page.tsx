import { redirect } from "next/navigation";

/** QA campaign management lives in the Ops Dashboard. */
export default function QaCampaignsPage() {
  redirect("/admin-access#quality");
}
