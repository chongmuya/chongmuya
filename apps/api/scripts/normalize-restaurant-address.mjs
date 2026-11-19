// Occasional address maintenance, separate from daily merchant/message operations.
import "reflect-metadata";
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { open } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { RestaurantOperationsService } from "../dist/modules/restaurants/restaurant-operations.service.js";
import {
  operationId,
  requireOperator,
  printOperation,
  printOperationError,
} from "./merchant-cli.mjs";
config({ quiet: true });
let app, output;
try {
  const { values: v } = parseArgs({
    options: Object.fromEntries(
      [
        "restaurant",
        "version",
        "query",
        "base-address",
        "detail-address",
        "actor",
        "reason",
        "output",
      ]
        .map((key) => [key, { type: "string" }])
        .concat([
          ["execute", { type: "boolean", default: false }],
          ["list", { type: "boolean", default: false }],
        ]),
    ),
  });
  if (v.list) {
    if (v.execute || v.restaurant) throw new Error("INVALID_ADDRESS_INPUT");
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
      abortOnError: false,
    });
    console.table(await app.get(RestaurantOperationsService).addressReview());
  } else {
    requireOperator(v);
    const restaurantId = operationId(v.restaurant);
    if (
      !/^\d+$/.test(v.version ?? "") ||
      !v.query?.trim() ||
      !v["base-address"]?.trim()
    )
      throw new Error("INVALID_ADDRESS_INPUT");
    if (v.output) output = await open(v.output, "wx", 0o600);
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
      abortOnError: false,
    });
    const result = await app.get(RestaurantOperationsService).normalizeAddress({
      restaurantId,
      version: Number(v.version),
      query: v.query,
      baseAddress: v["base-address"],
      detailAddress: v["detail-address"] ?? "",
      actor: v.actor,
      reason: v.reason,
      dryRun: !v.execute,
    });
    if (output) await output.writeFile(JSON.stringify(result, null, 2) + "\n");
    printOperation("normalize-address", result, v);
  }
} catch (error) {
  printOperationError(error);
  process.exitCode = 1;
} finally {
  await output?.close();
  await app?.close();
}
