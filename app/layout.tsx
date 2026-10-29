import "./globals.css";
import "./mobile-fit.css";
import "./motion.css";
import Providers from "./providers";
import MainNav from "./main-nav";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import PilotFeedbackLauncher from "@/app/components/pilot-feedback-launcher";

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
  const showStudentPilot = showQaCampaigns && isQaRunnerEnabled();
  const showPilotFeedback = isQaRunnerEnabled();
  return (
    <html lang="en">
      <body>
        <Providers>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          <MainNav showQaCampaigns={showQaCampaigns} showStudentPilot={showStudentPilot} />
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          {showPilotFeedback ? <PilotFeedbackLauncher /> : null}
        </Providers>
      </body>
    </html>
  );
}
