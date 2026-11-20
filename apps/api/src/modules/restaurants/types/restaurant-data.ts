import { z } from "zod";
import { policiesSchema, weeklyHoursSchema } from "./registration.js";
import {
  normalizePublicPhone,
  validPublicPhone,
} from "../lib/restaurant-public-phone.js";

export const restaurantDataKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);
const text = z.string().max(10000).nullable();
const amount = z.number().int().min(0).max(2_000_000_000).nullable();
const capacity = z.number().int().positive().max(100000).nullable();
const timestamp = z.iso
  .datetime({ offset: true })
  .refine((v) => Date.parse(v) <= Date.now())
  .nullable();
const phone = z
  .string()
  .max(30)
  .regex(/^[0-9 -]+$/)
  .transform((v) => v.replace(/[ -]/g, ""));
export const contactDataSchema = z
  .object({
    phone: phone.pipe(z.string().regex(/^01[016789]\d{7,8}$/)),
    requestConsentAt: timestamp.default(null),
    consentNote: z.string().trim().max(500).nullable().default(null),
  })
  .strict();
const localContactSchema = contactDataSchema.extend({
  phone: z.literal("00000000000"),
});
export type ContactData = z.infer<typeof contactDataSchema>;

export const spaceDataSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    kind: z.enum(["HALL", "ROOM", "FLOOR", "WHOLE"]),
    availability: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
    togetherSeating: z.enum(["YES", "NO", "UNKNOWN"]),
    capacity,
    minGuests: amount,
    minSpend: amount,
    separateFee: amount,
    conditions: text,
  })
  .strict();
export const menuDataSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["REGULAR", "SET"]),
    price: amount,
    unit: z.string().trim().min(1).max(30),
    available: z.boolean(),
    position: z.number().int().min(0).max(10000),
  })
  .strict();
const fields = z
  .object({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(240),
    publicPhone: z
      .string()
      .max(30)
      .refine(validPublicPhone)
      .transform(normalizePublicPhone)
      .nullable()
      .optional(),
    region: z.string().trim().min(1).max(80),
    category: z.string().max(40).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    maxCapacity: capacity,
    photoPath: z.string().max(500).nullable(),
    facilities: text,
    operatingHours: text,
    bookingPolicy: text,
    depositPolicy: text,
    menuPolicy: text,
    cancellationPolicy: text,
    published: z.boolean(),
    verifiedAt: timestamp,
    spacePhotos: z
      .array(
        z
          .object({
            path: z.string().min(1).max(500),
            description: z.string().max(500),
            position: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export function restaurantImportSchema(local = false) {
  return z
    .object({
      restaurants: z
        .array(
          fields.extend({
            key: restaurantDataKey,
            spacePhotos: fields.shape.spacePhotos.default([]),
            spaces: z
              .array(spaceDataSchema.extend({ key: restaurantDataKey }))
              .max(100),
            // Initial menu ordering follows the file. An optional supplied position is validated, not trusted as the order.
            menus: z
              .array(
                menuDataSchema.extend({
                  key: restaurantDataKey,
                  position: menuDataSchema.shape.position.optional(),
                }),
              )
              .max(1000),
            contact: (local ? localContactSchema : contactDataSchema)
              .nullable()
              .optional(),
          }),
        )
        .min(1)
        .max(1000),
    })
    .strict();
}
const target = { id: z.uuid().optional(), key: restaurantDataKey.optional() };
const resourceKey = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,99}(?:\/[a-z0-9][a-z0-9-]{0,99})?$/);
const resourceTarget = { id: z.uuid().optional(), key: resourceKey.optional() };
const exactlyOneTarget = (v: { id?: string; key?: string }) =>
  !!v.id !== !!v.key;
const spaceChange = z.union([
  z
    .object({
      action: z.literal("add"),
      key: resourceKey,
      data: spaceDataSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      ...resourceTarget,
      changes: spaceDataSchema
        .partial()
        .refine((v) => Object.keys(v).length > 0),
    })
    .strict()
    .refine(exactlyOneTarget),
]);
const menuChange = z.union([
  z
    .object({
      action: z.literal("add"),
      key: resourceKey,
      data: menuDataSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      ...resourceTarget,
      changes: menuDataSchema
        .partial()
        .refine((v) => Object.keys(v).length > 0),
    })
    .strict()
    .refine(exactlyOneTarget),
]);
export const restaurantUpdateSchema = z
  .object({
    restaurants: z
      .array(
        z
          .object({
            ...target,
            expectedVersion: z.number().int().positive(),
            changes: fields
              .partial()
              .extend({
                policies: policiesSchema
                  .partial()
                  .extend({
                    weeklyHours: weeklyHoursSchema.nullable().optional(),
                  })
                  .refine((v) => Object.keys(v).length > 0)
                  .optional(),
                contact: contactDataSchema.nullable().optional(),
                spaces: z.array(spaceChange).max(100).optional(),
                menus: z.array(menuChange).max(1000).optional(),
              })
              .strict()
              .refine((v) => Object.keys(v).length > 0),
          })
          .strict()
          .refine(exactlyOneTarget),
      )
      .min(1)
      .max(1000),
  })
  .strict();

// Error paths contain schema field names and numeric indexes only, never unknown input keys or values.
const safeNames = new Set([
  "restaurants",
  "changes",
  "data",
  "action",
  "id",
  "key",
  "expectedVersion",
  "spaces",
  "menus",
  "contact",
  ...Object.keys(fields.shape),
  ...Object.keys(spaceDataSchema.shape),
  ...Object.keys(menuDataSchema.shape),
  ...Object.keys(contactDataSchema.shape),
  "policies",
  ...Object.keys(policiesSchema.shape),
]);
export class RestaurantDataError extends Error {
  constructor(
    readonly code: string,
    readonly fields: string[] = [],
  ) {
    super(code);
  }
}
export function parseRestaurantData<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new RestaurantDataError("VALIDATION_FAILED", [
      ...new Set(
        result.error.issues.map(
          (i) =>
            i.path
              .map((p) =>
                typeof p === "number"
                  ? p
                  : safeNames.has(String(p))
                    ? p
                    : "field",
              )
              .join(".") || "input",
        ),
      ),
    ]);
  return result.data;
}
