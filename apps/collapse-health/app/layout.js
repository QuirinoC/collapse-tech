import "./globals.css";

export const metadata = {
  title: "Collapse Health — World-class care in Mexico, at up to 70% less",
  description:
    "Collapse Health connects American and Canadian patients with vetted, certified hospitals and specialists in Mexico. Dental, bariatric, cosmetic, orthopedic and fertility care at 40–70% below U.S. prices.",
  metadataBase: new URL("https://health.collapsetechnologies.com"),
  openGraph: {
    title: "Collapse Health",
    description:
      "Vetted Mexican hospitals and specialists for American and Canadian patients — save 40–70% on life-changing care.",
    siteName: "Collapse Health",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
