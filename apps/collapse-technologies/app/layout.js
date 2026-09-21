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
    "Independent studio. Infinite Pixelboard, Trust Circle, The Fly, Asymmetric Challenge, and CoachGG.",
  metadataBase: new URL("https://collapsetechnologies.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Collapse Technologies",
    description:
      "Independent studio. Infinite Pixelboard, Trust Circle, The Fly, Asymmetric Challenge, and CoachGG.",
    siteName: "Collapse Technologies",
    type: "website",
    url: "/",
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
