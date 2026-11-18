import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      // Match the custom theme tokens in app/globals.css.
      text: ["control", "caption", "label"],
      radius: ["control", "card", "panel", "pill"],
      spacing: ["control", "input"],
      shadow: ["control", "card"],
    },
  },
});

export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
