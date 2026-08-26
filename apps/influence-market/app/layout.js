import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata = {
  title: "Influence.Market",
  description:
    "One brief. Every audience. Fund multi-creator campaigns upfront; we hold the funds and pay creators when deliverables are verified.",
  metadataBase: new URL("https://influence.collapsetechnologies.com"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "Influence.Market",
    description:
      "The agency-marketplace hybrid: one contract, many creators, escrowed budgets.",
    siteName: "Influence.Market",
    url: "/",
  },
};

export const viewport = {
  themeColor: "#fff8fc",
  colorScheme: "light",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${playfair.variable}`}>
        {children}
      </body>
    </html>
  );
}
