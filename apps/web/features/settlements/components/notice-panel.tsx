"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { ApiError } from "@/shared/http/api-error";
import { settlementKey, settlementPath } from "../api/settlement.api";
import type { Access, Detail, Notice } from "../types/settlement.types";
import { noticeSchema, type NoticeValues } from "../schemas/notice.schema";
import { useSettlementCommand } from "../hooks/use-settlement-command";
import { CommandStatus } from "./command-status";
function NoticeForm({
  a,
  data,
  previous,
  onClose,
}: {
  a: Access;
  data: Detail;
  previous?: Notice;
  onClose: () => void;
}) {
  const [base, setBase] = useState(data.state.version),
    command = useSettlementCommand(a),
    bank = previous?.bank ?? data.bankDefault;
  const form = useForm<NoticeValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      title: previous?.title ?? "행사 정산 안내",
      message:
        previous?.message ??
        "함께해서 즐거웠어요! 확인 후 기한 내 입금 부탁드려요.",
      bank: bank?.bank ?? "",
      account: bank?.account ?? "",
      holder: bank?.holder ?? "",
      deadline: previous?.deadline ?? "",
      saveBank: false,
      includePeople: previous?.includePeople ?? false,
      scope: previous?.scope ?? "ALL",
    },
  });
  const v = useWatch({ control: form.control });
  const amount =
    v.scope === "ALL"
      ? data.summary.target
      : data.summary.people.reduce((n, p) => n + p.remaining, 0);
  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit(async (v) => {
        if (base !== data.state.version || command.uncertain) return;
        if (amount > 0 && (!v.bank || !v.account || !v.holder)) {
          form.setError("account", {
            message: "은행·계좌번호·예금주를 모두 입력해 주세요.",
          });
          return;
        }
        try {
          await command.mutateAsync({
            action: "NOTICE",
            expectedVersion: base,
            replaces: previous?.id ?? null,
            title: v.title,
            message: v.message,
            bank:
              v.bank && v.account && v.holder
                ? { bank: v.bank, account: v.account, holder: v.holder }
                : null,
            deadline: v.deadline || null,
            saveBank: v.saveBank,
            includePeople: v.includePeople,
            scope: v.scope,
          });
          if (command.active.current) onClose();
        } catch {}
      })}
    >
      <h2 className="text-2xl font-bold">
        정산문 {previous ? "수정본" : "만들기"}
      </h2>
      <fieldset
        disabled={command.isPending || command.uncertain}
        className="space-y-5"
      >
        <label>
          정산 대상
          <select
            {...form.register("scope")}
            className="ml-3 rounded-pill border p-3"
          >
            <option value="ALL">전체</option>
            <option value="UNCONFIRMED">입금 미확인</option>
          </select>
        </label>
        <p className="font-semibold">
          {amount.toLocaleString()}원{amount === 0 && " · 입금 요청 없음"}
        </p>
        {(
          [
            ["title", "제목"],
            ["bank", "은행"],
            ["account", "계좌번호"],
            ["holder", "예금주"],
            ["deadline", "확인 기한"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="block space-y-2">
            <span>{label}</span>
            <Input
              variant="form"
              type={name === "deadline" ? "date" : "text"}
              {...form.register(name)}
              aria-invalid={!!form.formState.errors[name]}
              aria-describedby={`notice-${name}-error`}
            />
            <span id={`notice-${name}-error`} className="text-danger">
              {form.formState.errors[name]?.message}
            </span>
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input type="checkbox" {...form.register("saveBank")} />
          계좌 정보 저장하기 (내 다음 작성 기본값)
        </label>
        <label className="block">
          안내 메시지
          <textarea
            className="mt-2 min-h-28 w-full rounded-[20px] border border-field p-4"
            {...form.register("message")}
            aria-invalid={!!form.formState.errors.message}
            aria-describedby="notice-message-error"
          />
          <span id="notice-message-error" className="text-danger">
            {form.formState.errors.message?.message}
          </span>
          <span className="block text-right text-xs">
            {v.message?.length ?? 0}/300
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...form.register("includePeople")} />
          정산문에 개인별 정산 금액 포함하기
        </label>
        <p className="rounded-xl bg-choice p-4 text-sm">
          전화번호 뒤4자리는 공유 문구에 넣지 않습니다. 금액은 지출에서 수정해
          주세요. 수정본은 현재 계산으로 새로 생성되며 이전 문구도 보존합니다.
        </p>
      </fieldset>
      {base !== data.state.version && !command.uncertain && (
        <div role="alert">
          <p>
            최신 정산 대상 {data.summary.target.toLocaleString()}원. 입력을
            유지하고 최신 계산으로 다시 확인해 주세요.
          </p>
          <Button onClick={() => setBase(data.state.version)}>
            최신 계산 확인 · 재적용 준비
          </Button>
        </div>
      )}
      <CommandStatus command={command} />
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            command.isPending ||
            command.uncertain ||
            base !== data.state.version ||
            data.summary.drafts > 0
          }
        >
          정산문 생성하기
        </Button>
        <Button
          variant="outline"
          onClick={onClose}
          disabled={command.isPending || command.uncertain}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
function NoticeDetail({
  a,
  id,
  onEdit,
}: {
  a: Access;
  id: string;
  onEdit: (n: Notice) => void;
}) {
  const [message, setMessage] = useState("");
  const q = useQuery({
    queryKey: [...settlementKey(a), "notice", id],
    queryFn: ({ signal }) =>
      a.request<Notice & { outdated: boolean }>(
        `${settlementPath(a)}/notices/${id}`,
        { signal },
      ),
    retry: false,
    staleTime: 0,
  });
  if (q.error instanceof ApiError && [401, 403, 404].includes(q.error.status))
    return <p role="alert">정산문에 접근할 수 없습니다.</p>;
  const n = q.data;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(n!.text);
      setMessage("복사했습니다.");
    } catch {
      setMessage("복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };
  return (
    <section className="space-y-4">
      {q.error && <p role="alert">{safeErrorMessage(q.error)}</p>}
      {n && (
        <>
          <p>
            계산 버전 {n.calculationVersion} ·{" "}
            {new Date(n.createdAt).toLocaleString("ko-KR")}
            {n.outdated && " · 현재 계산과 달라 재생성 필요"}
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-[20px] bg-choice p-5 font-sans text-sm">
            {n.text}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="brand-outline" onClick={() => void copy()}>
              복사하기
            </Button>
            <Button
              onClick={async () => {
                if (!navigator.share) {
                  setMessage(
                    "이 브라우저는 시스템 공유를 지원하지 않습니다. 복사하기를 이용해 주세요.",
                  );
                  return;
                }
                try {
                  await navigator.share({ title: n.title, text: n.text });
                  setMessage(
                    "공유 창 작업을 마쳤습니다. 수신·열람 여부는 확인하지 않습니다.",
                  );
                } catch (e) {
                  setMessage(
                    e instanceof DOMException && e.name === "AbortError"
                      ? "공유를 취소했습니다."
                      : "공유하지 못했습니다. 복사하기를 이용해 주세요.",
                  );
                }
              }}
            >
              공유하기
            </Button>
            <Button variant="outline" onClick={() => onEdit(n)}>
              입력 내용 수정본 만들기
            </Button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function NoticePanel({
  access: a,
  data,
}: {
  access: Access;
  data: Detail;
}) {
  const [editing, setEditing] = useState<Notice | "new" | null>(null),
    [id, setId] = useState<string | null>(null);
  if (editing)
    return (
      <NoticeForm
        key={editing === "new" ? "new" : editing.id}
        a={a}
        data={data}
        previous={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
      />
    );
  return (
    <div className="space-y-5">
      <Button
        onClick={() => setEditing("new")}
        disabled={data.summary.drafts > 0 || data.summary.status === "EMPTY"}
      >
        새 정산문 만들기
      </Button>
      {data.summary.drafts > 0 && (
        <p role="alert">
          미완성 지출 {data.summary.drafts}개를 먼저 완료해 주세요.
        </p>
      )}
      {!data.state.notices.length && (
        <div className="py-10 text-center">
          <h2 className="text-2xl font-bold">정산문을 만들어 보세요</h2>
          <p className="mt-3 text-xs text-secondary">
            지출과 입금 확인 내용을 바탕으로 안내문을 만들어요.
          </p>
        </div>
      )}
      {data.state.notices.map((n) => (
        <button
          key={n.id}
          className="block w-full rounded-[20px] bg-choice p-5 text-left"
          onClick={() => setId(n.id)}
        >
          <strong>{n.title}</strong>
          <small className="block">
            {new Date(n.createdAt).toLocaleString("ko-KR")} · 계산{" "}
            {n.calculationVersion}
            {n.outdated && " · 재생성 필요"}
          </small>
        </button>
      ))}
      {id && (
        <NoticeDetail
          key={id + ":" + data.state.version}
          a={a}
          id={id}
          onEdit={setEditing}
        />
      )}
    </div>
  );
}
