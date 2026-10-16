import "./globals.css";
import Providers from "./providers";
import MainNav from "./main-nav";

export const metadata = {
  title: "Post2Drive",
  description: "Freight and courier marketplace for businesses, fleets and independent drivers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <MainNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
