import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      // Match the custom --text-* font sizes in app/globals.css.
      text: ["control", "caption", "label"],
    },
  },
});

export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
