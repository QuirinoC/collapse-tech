import { isProTier } from "./ads.mjs";

export const FREE_COLORS = [
  "#171714",
  "#d3523c",
  "#dc9b32",
  "#e1c94a",
  "#587554",
  "#356b76",
  "#425b8c",
  "#7e5078",
  "#f7f3ea",
];

export const PRO_COLORS = [
  "#171714",
  "#000000",
  "#5b4636",
  "#b94e48",
  "#d3523c",
  "#f08a6a",
  "#dc9b32",
  "#f4a261",
  "#e1c94a",
  "#f2c14e",
  "#587554",
  "#9aa66f",
  "#356b76",
  "#2f8f83",
  "#425b8c",
  "#6d7fb3",
  "#7e5078",
  "#a45a9c",
  "#c7a6d8",
  "#d8b4a0",
  "#9b9b93",
  "#e5e5d8",
  "#f7f3ea",
  "#ffffff",
];

const COLOR_NAMES = new Map([
  ["#171714", "Near-black"],
  ["#d3523c", "Red"],
  ["#dc9b32", "Orange"],
  ["#e1c94a", "Yellow"],
  ["#587554", "Green"],
  ["#356b76", "Cyan"],
  ["#425b8c", "Blue"],
  ["#7e5078", "Violet"],
  ["#f7f3ea", "Off-white"],
  ["#5b4636", "Brown"],
  ["#b94e48", "Rose"],
  ["#f08a6a", "Coral"],
  ["#f2c14e", "Gold"],
  ["#9aa66f", "Olive"],
  ["#2f8f83", "Teal"],
  ["#6d7fb3", "Periwinkle"],
  ["#a45a9c", "Magenta"],
  ["#c7a6d8", "Lilac"],
  ["#d8b4a0", "Blush"],
  ["#9b9b93", "Gray"],
  ["#e5e5d8", "Ivory"],
  ["#ffffff", "White"],
  ["#000000", "Black"],
  ["#f4a261", "Apricot"],
]);

export function colorName(color) {
  return COLOR_NAMES.get(color.toLowerCase()) ?? color;
}

export function colorsForState(state) {
  if (Array.isArray(state?.allowedColors) && state.allowedColors.length > 0) {
    return state.allowedColors;
  }
  return isProTier(state?.tier) ? PRO_COLORS : FREE_COLORS;
}

export function customColorsAllowed(state) {
  return isProTier(state?.tier);
}
