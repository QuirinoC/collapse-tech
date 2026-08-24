export const procedures = [
  {
    name: "Dental implants (full arch)",
    usPrice: 24000,
    mxPrice: 9000,
    desc: "All-on-X with board-certified implantologists in Los Algodones or Tijuana.",
  },
  {
    name: "Gastric sleeve",
    usPrice: 18000,
    mxPrice: 5500,
    desc: "Laparoscopic sleeve gastrectomy with bariatric-certified surgeons.",
  },
  {
    name: "Cosmetic surgery (mommy makeover)",
    usPrice: 16000,
    mxPrice: 6500,
    desc: "Board-certified plastic surgeons in Tijuana, Cancún and Guadalajara.",
  },
  {
    name: "Hip replacement",
    usPrice: 40000,
    mxPrice: 14000,
    desc: "Total hip arthroplasty at internationally accredited hospitals in Monterrey or Guadalajara.",
  },
  {
    name: "IVF cycle",
    usPrice: 20000,
    mxPrice: 7500,
    desc: "Full IVF with ICSI at high-success fertility clinics in Mexico City and Monterrey.",
  },
  {
    name: "Dental crowns (per crown)",
    usPrice: 1800,
    mxPrice: 450,
    desc: "Zirconia crowns, same-day CAD/CAM options available.",
  },
];

export function pctSaving(usPrice, mxPrice) {
  return Math.round(((usPrice - mxPrice) / usPrice) * 100);
}
