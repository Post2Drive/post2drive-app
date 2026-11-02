import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import NotificationCenter from "@/components/notification-center";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <main className="ops-theme-dashboard" style={{ maxWidth: 900, margin: "0 auto", padding: "20px 20px 60px" }}>
      <h1 style={{ marginTop: 0 }}>Notifications</h1>
      <NotificationCenter />
    </main>
  );
}
