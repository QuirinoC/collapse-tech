import { SiteBanner } from "./SiteBanner";
import "./globals.css";

export const metadata = {
  title: "Collapse Health — Medical care in Mexico, coordinated end-to-end (concept preview)",
  description:
    "Collapse Health is a planned medical travel facilitation service connecting American and Canadian patients with licensed Mexican providers. Currently in development and not operating.",
  metadataBase: new URL("https://health.collapsetechnologies.com"),
  openGraph: {
    title: "Collapse Health",
    description:
      "A planned medical travel facilitation service for North American patients considering care in Mexico. Concept preview — not yet operating.",
    siteName: "Collapse Health",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteBanner />
        {children}
      </body>
    </html>
  );
}
