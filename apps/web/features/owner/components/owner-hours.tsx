"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { isAccessError } from "@/shared/http/access-error";
import { hoursQuery, saveHours, type HoursData } from "../api/hours.api";
const schema = z.object({
  days: z
    .array(
      z.object({
        kind: z.enum(["DEFAULT", "OPEN", "CLOSED"]),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        endDayOffset: z.union([z.literal(0), z.literal(1)]),
      }),
    )
    .length(7),
  note: z.string().max(500, "500자 이내로 입력해 주세요."),
});
export function OwnerHours({
  accountId,
  restaurantId,
  request,
}: {
  accountId: string;
  restaurantId: string;
  request: SessionRequest;
}) {
  const q = useQuery(hoursQuery(accountId, restaurantId, request));
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">요일별 영업시간</h1>
      {q.isError && <ErrorState retry={() => void q.refetch()} />}{" "}
      {q.data && !isAccessError(q.error) ? (
        <HoursForm
          accountId={accountId}
          restaurantId={restaurantId}
          request={request}
          latest={q.data}
          refresh={() => void q.refetch()}
        />
      ) : (
        !q.isError && <LoadingState>불러오는 중…</LoadingState>
      )}
    </section>
  );
}
function HoursForm({
  accountId,
  restaurantId,
  request,
  latest,
  refresh,
}: {
  accountId: string;
  restaurantId: string;
  request: SessionRequest;
  latest: HoursData;
  refresh: () => void;
}) {
  const [base, setBase] = useState(latest.version),
    active = useActiveScreen(),
    cache = useQueryClient();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: latest.hours,
  });
  const days = useWatch({ control: form.control, name: "days" });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof schema>) =>
      saveHours(request, restaurantId, base, v),
    onSuccess: (r) => {
      if (active.current) {
        setBase(r.version);
        cache.setQueryData(
          hoursQuery(accountId, restaurantId, request).queryKey,
          r,
        );
      }
    },
    onError: () => {
      if (active.current) refresh();
    },
    retry: false,
  });
  return (
    <form
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      className="space-y-4"
    >
      <p className="text-sm">
        대표시간:{" "}
        {latest.representative
          ? `${latest.representative.start} ~ ${latest.representative.endDayOffset ? "익일 " : ""}${latest.representative.end}`
          : "확인 필요"}{" "}
        · 기본값은 기존 대표시간·정기휴무를 따라요.
      </p>
      <fieldset disabled={save.isPending} className="space-y-5">
        {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
          <div key={day} className="rounded-control bg-surface p-4">
            <label>
              {day}요일{" "}
              <select {...form.register(`days.${i}.kind`)}>
                <option value="DEFAULT">대표시간 적용</option>
                <option value="OPEN">영업</option>
                <option value="CLOSED">휴무</option>
              </select>
            </label>
            {days[i].kind === "OPEN" && (
              <div className="mt-3 flex flex-wrap gap-3">
                <label>
                  시작{" "}
                  <input
                    type="time"
                    {...form.register(`days.${i}.start`)}
                    required
                  />
                </label>
                <label>
                  마감{" "}
                  <input
                    type="time"
                    {...form.register(`days.${i}.end`)}
                    required
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={days[i].endDayOffset === 1}
                    onChange={(e) =>
                      form.setValue(
                        `days.${i}.endDayOffset`,
                        e.target.checked ? 1 : 0,
                      )
                    }
                  />
                  익일 마감
                </label>
              </div>
            )}
          </div>
        ))}
        <label className="block">
          비정기 휴무 안내
          <textarea
            className="mt-2 w-full rounded-control bg-surface p-3"
            {...form.register("note")}
            aria-describedby="hours-note-error"
            aria-invalid={!!form.formState.errors.note}
          />
        </label>
        <p id="hours-note-error">{form.formState.errors.note?.message}</p>
      </fieldset>
      {save.isError && (
        <div role="alert">
          <p>
            저장을 확인하지 못했어요. 시작·마감 시각과 최신 내용을 확인해
            주세요. 익일 마감은 24시간 이내여야 해요.
          </p>
          <Button variant="outline" onClick={refresh}>
            최신 내용 확인
          </Button>
          <pre className="overflow-auto whitespace-pre-wrap text-xs">
            {latest.hours.days
              .map(
                (d, i) =>
                  `${["일", "월", "화", "수", "목", "금", "토"][i]}: ${d.kind === "OPEN" ? `${d.start}~${d.endDayOffset ? "익일 " : ""}${d.end}` : d.kind === "CLOSED" ? "휴무" : "대표시간"}`,
              )
              .join("\n")}
            {"\n"}
            {latest.hours.note}
          </pre>
          <Button
            variant="outline"
            onClick={() => {
              setBase(latest.version);
              save.reset();
            }}
          >
            최신 버전에 내 입력 명시적으로 재적용
          </Button>
        </div>
      )}
      {save.isSuccess && <p role="status">영업시간을 저장했어요.</p>}
      <Button
        type="submit"
        disabled={save.isPending || base !== latest.version}
      >
        영업시간 저장
      </Button>
    </form>
  );
}
