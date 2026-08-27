import { SiteBanner } from "./SiteBanner";
import "./globals.css";

export const metadata = {
  title: "Collapse Health — Concept Preview",
  description:
    "Collapse Health is an early concept from Collapse Technologies. It is not operating or providing health-travel services.",
  metadataBase: new URL("https://health.collapsetechnologies.com"),
  openGraph: {
    title: "Collapse Health",
    description:
      "An early Collapse Technologies concept preview. No health-travel services are currently available.",
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
