import type { MetadataRoute } from "next";

/**
 * Web app manifest: lets people add Post2Drive to their phone's home screen
 * from the browser (the route for iPhone users while there is no App Store
 * app) and open it full-screen with the right name and icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Post2Drive",
    short_name: "Post2Drive",
    description: "Freight and courier marketplace for businesses, fleets and independent drivers",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#102A43",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
