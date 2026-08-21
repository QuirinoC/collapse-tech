"use client";

import { track } from "@vercel/analytics";

export default function ProductLink({ children, className, href, merchant }) {
  return (
    <a
      className={className}
      href={href}
      onClick={() =>
        track("outbound_product_click", {
          merchant: merchant.slice(0, 80),
        })
      }
      rel="noopener noreferrer sponsored"
      target="_blank"
    >
      {children}
    </a>
  );
}
