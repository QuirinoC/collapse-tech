import { isProTier } from "./ads.mjs";

export const FREE_COLORS = [
  "#171714",
  "#f7f3ea",
  "#d3523c",
  "#dc9b32",
  "#e1c94a",
  "#587554",
  "#356b76",
  "#425b8c",
  "#7e5078",
];

export const PRO_COLORS = [
  ...FREE_COLORS,
  "#5b4636",
  "#b94e48",
  "#f08a6a",
  "#f2c14e",
  "#9aa66f",
  "#2f8f83",
  "#6d7fb3",
  "#a45a9c",
  "#c7a6d8",
  "#d8b4a0",
  "#e5e5d8",
  "#9b9b93",
  "#ffffff",
  "#000000",
  "#f4a261",
];

export function colorsForState(state) {
  if (Array.isArray(state?.allowedColors) && state.allowedColors.length > 0) {
    return state.allowedColors;
  }
  return isProTier(state?.tier) ? PRO_COLORS : FREE_COLORS;
}

export function customColorsAllowed(state) {
  return isProTier(state?.tier);
}
