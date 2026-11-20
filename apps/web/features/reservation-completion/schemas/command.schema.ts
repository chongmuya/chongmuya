import { z } from "zod";
import type { Field } from "../types/command-field";
export const commandSchema = (fields: Field[]) =>
  z.object(
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        z.string().superRefine((v, c) => {
          if (!f.optional && !v.trim())
            c.addIssue({
              code: "custom",
              message: "이 항목을 입력하거나 확인해 주세요.",
            });
          if (f.max && v.length > f.max)
            c.addIssue({
              code: "custom",
              message: `${f.max}자 이내로 입력해 주세요.`,
            });
          if (
            f.type === "number" &&
            v &&
            (!Number.isSafeInteger(Number(v)) ||
              Number(v) < 0 ||
              Number(v) > 2_000_000_000)
          )
            c.addIssue({
              code: "custom",
              message: "0~20억 사이의 정수를 입력해 주세요.",
            });
          if (
            f.type === "datetime-local" &&
            v &&
            !Number.isFinite(Date.parse(v))
          )
            c.addIssue({
              code: "custom",
              message: "날짜와 시간을 확인해 주세요.",
            });
        }),
      ]),
    ),
  );
