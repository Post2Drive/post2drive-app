import "./globals.css";
import Providers from "./providers";
import MainNav from "./main-nav";
import { isTesterAdmin } from "@/lib/testerAdmin";

export const metadata = {
  title: "Post2Drive",
  description: "Freight and courier marketplace for businesses, fleets and independent drivers",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const showQaCampaigns = await isTesterAdmin();
  return (
    <html lang="en">
      <body>
        <Providers>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          <MainNav showQaCampaigns={showQaCampaigns} />
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
