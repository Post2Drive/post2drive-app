import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function isTesterAdmin() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const allowedEmails = (process.env.POST2DRIVE_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowedEmails.includes(email));
}
