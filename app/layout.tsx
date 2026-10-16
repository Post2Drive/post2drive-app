import "./globals.css";
import Providers from "./providers";
import MainNav from "./main-nav";

export const metadata = {
  title: "Post2Drive",
  description: "UK freight and courier job marketplace",
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
