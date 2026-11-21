import { z } from "zod";
import type { Field } from "../types/command-field";
export const commandSchema = (fields: Field[]) =>
  z
    .object(Object.fromEntries(fields.map((f) => [f.name, z.string()])))
    .superRefine((values, ctx) => {
      for (const f of fields) {
        if (f.when?.(values) === false) continue;
        const v = values[f.name];
        const invalid = (message: string) =>
          ctx.addIssue({ code: "custom", path: [f.name], message });
        if (!f.optional && !v.trim())
          invalid("이 항목을 입력하거나 확인해 주세요.");
        if (f.max && v.length > f.max)
          invalid(`${f.max}자 이내로 입력해 주세요.`);
        if (v && f.options && !f.options.some((option) => option.value === v))
          invalid("목록에서 선택해 주세요.");
        if (
          f.type === "number" &&
          v &&
          (!Number.isSafeInteger(Number(v)) ||
            Number(v) < 0 ||
            Number(v) > 2_000_000_000)
        )
          invalid("0~20억 사이의 정수를 입력해 주세요.");
        if (
          f.type === "number" &&
          v &&
          ((f.minValue !== undefined && Number(v) < f.minValue) ||
            (f.maxValue !== undefined && Number(v) > f.maxValue))
        )
          invalid("허용된 범위의 수량을 입력해 주세요.");
        if (f.type === "datetime-local" && v && !Number.isFinite(Date.parse(v)))
          invalid("날짜와 시간을 확인해 주세요.");
      }
    });
