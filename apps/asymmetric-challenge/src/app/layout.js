import "../../../../shared/design/roman.css";
import "./globals.css";

export const metadata = {
  title: "Asymmetric Challenge — Fictional Demo",
  description:
    "A fictional interactive demo exploring 256-bit key guesses and a public SHA-256 commitment. No prize is offered.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
