import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Influence.Market",
  description:
    "One brief. Every audience. Fund multi-creator campaigns upfront; we hold the funds and pay creators when deliverables are verified.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://influence.market",
  ),
  openGraph: {
    title: "Influence.Market",
    description:
      "The agency-marketplace hybrid: one contract, many creators, escrowed budgets.",
    siteName: "Influence.Market",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
