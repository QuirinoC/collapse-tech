// Illustrative price examples based on publicly reported market rates.
// These are NOT quotes, offers, or guarantees. Actual prices vary by
// provider, case complexity, and time.
export const procedures = [
  {
    name: "Dental implants (full arch)",
    usPrice: 24000,
    mxPrice: 9000,
    desc: "All-on-X implant treatment, commonly sought in border dental towns.",
  },
  {
    name: "Gastric sleeve",
    usPrice: 18000,
    mxPrice: 5500,
    desc: "Laparoscopic sleeve gastrectomy, one of the most-traveled-for procedures.",
  },
  {
    name: "Cosmetic surgery (mommy makeover)",
    usPrice: 16000,
    mxPrice: 6500,
    desc: "Combined cosmetic procedures from board-certified plastic surgeons.",
  },
  {
    name: "Hip replacement",
    usPrice: 40000,
    mxPrice: 14000,
    desc: "Total hip arthroplasty at major hospital cities.",
  },
  {
    name: "IVF cycle",
    usPrice: 20000,
    mxPrice: 7500,
    desc: "Full IVF with ICSI at established fertility clinics.",
  },
  {
    name: "Dental crowns (per crown)",
    usPrice: 1800,
    mxPrice: 450,
    desc: "Zirconia crowns, same-day CAD/CAM options commonly available.",
  },
];

export function pctSaving(usPrice, mxPrice) {
  return Math.round(((usPrice - mxPrice) / usPrice) * 100);
}
