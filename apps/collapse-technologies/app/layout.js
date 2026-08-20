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
  title: "Collapse Technologies",
  description:
    "Independent technology studio building software, games, and long-term platforms.",
  metadataBase: new URL("https://collapsetechnologies.com"),
  openGraph: {
    title: "Collapse Technologies",
    description: "Software, games, and things still taking shape.",
    siteName: "Collapse Technologies",
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
