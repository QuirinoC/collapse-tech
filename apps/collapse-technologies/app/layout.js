import "../../../shared/design/roman.css";
import "./globals.css";

export const metadata = {
  title: "Collapse Technologies",
  description:
    "An independent technology studio building interactive software, games, and long-lived tools.",
  metadataBase: new URL("https://collapsetechnologies.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Collapse Technologies",
    description:
      "An independent technology studio building interactive software, games, and long-lived tools.",
    siteName: "Collapse Technologies",
    type: "website",
    url: "/",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
