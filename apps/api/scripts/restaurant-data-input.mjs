import { readPrivateInputBytes } from "./merchant-cli.mjs";
import { writeFile } from "node:fs/promises";

export const restaurantInputLimit = 1024 * 1024;
export async function privateRestaurantInput(file) {
  return JSON.parse(
    (await readPrivateInputBytes(file, restaurantInputLimit)).toString("utf8"),
  );
}
export async function copyRestaurantInput(source, destination) {
  await writeFile(
    destination,
    await readPrivateInputBytes(source, restaurantInputLimit),
    { mode: 0o600, flag: "wx" },
  );
}
