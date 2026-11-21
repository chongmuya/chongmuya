"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { Button } from "@/shared/ui/button";
import { FormInput } from "@/shared/ui/form-input";
import { safeErrorMessage } from "@/shared/http/error-contract";
import { ApiError } from "@/shared/http/api-error";
import { noticeQuery } from "../api/settlement.api";
import type { Access, Detail, Notice } from "../types/settlement.types";
import { noticeSchema, type NoticeValues } from "../schemas/notice.schema";
import { useSettlementCommand } from "../hooks/use-settlement-command";
import { CommandStatus } from "./command-status";
function NoticeForm({
  a,
  data,
  previous,
  initialScope = "ALL",
  onClose,
  onCreated,
}: {
  a: Access;
  data: Detail;
  previous?: Notice;
  initialScope?: Notice["scope"];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [base, setBase] = useState(data.state.version),
    command = useSettlementCommand(a, (result) => {
      if (result.createdNoticeId) onCreated(result.createdNoticeId);
    }),
    bank = previous?.actorId === a.accountId ? previous.bank : data.bankDefault;
  const form = useForm<NoticeValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      title: previous?.title ?? "행사 정산 안내",
      message:
        previous?.message ??
        (data.summary.target > 0
          ? "함께해서 즐거웠어요! 확인 후 기한 내 입금 부탁드려요."
          : "함께해서 즐거웠어요! 정산 내역을 확인해 주세요."),
      bank: bank?.bank ?? "",
      account: bank?.account ?? "",
      holder: bank?.holder ?? "",
      deadline: previous?.deadline ?? "",
      saveBank: false,
      includePeople: previous?.includePeople ?? false,
      scope: previous?.scope ?? initialScope,
    },
  });
  const v = useWatch({ control: form.control });
  const amount =
    v.scope === "ALL"
      ? data.summary.target
      : data.summary.people.reduce((n, p) => n + p.remaining, 0);
  useEffect(() => {
    if (!previous && !form.getFieldState("message").isDirty)
      form.setValue(
        "message",
        amount > 0
          ? "함께해서 즐거웠어요! 확인 후 기한 내 입금 부탁드려요."
          : "함께해서 즐거웠어요! 정산 내역을 확인해 주세요.",
      );
  }, [amount, previous, form]);
  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit(async (v) => {
        if (
          base !== data.state.version ||
          command.uncertain ||
          data.depositConflicts?.length
        )
          return;
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
        <fieldset className="space-y-4">
          <legend className="mb-3 text-lg font-semibold">정산 대상</legend>
          <div className="grid grid-cols-2 rounded-pill bg-field p-1">
            {(
              [
                ["ALL", "전체"],
                ["UNCONFIRMED", "입금 미확인"],
              ] as const
            ).map(([scope, label]) => (
              <label
                key={scope}
                className={`cursor-pointer rounded-pill p-3 text-center text-sm ${v.scope === scope ? "bg-brand text-white" : "text-secondary"}`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  value={scope}
                  {...form.register("scope")}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="rounded-card bg-surface p-5 shadow-card">
            <p className="mb-4 flex justify-between font-semibold">
              <span>요청 금액</span>
              <span>{amount.toLocaleString()}원</span>
            </p>
            <ul
              className="max-h-60 space-y-3 overflow-auto text-sm"
              aria-label="정산 대상별 금액"
            >
              {data.summary.people
                .filter((p) => v.scope === "ALL" || p.remaining > 0)
                .map((p) => (
                  <li key={p.person.id} className="flex justify-between gap-3">
                    <span>
                      {p.person.name}
                      {p.person.label ? ` (${p.person.label})` : ""}
                    </span>
                    <strong>
                      {(v.scope === "ALL"
                        ? p.amount
                        : p.remaining
                      ).toLocaleString()}
                      원
                    </strong>
                  </li>
                ))}
            </ul>
            {amount === 0 && (
              <p className="mt-3 text-sm text-secondary">
                입금 요청 없이 정산 내역을 안내해요.
              </p>
            )}
          </div>
        </fieldset>
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
            <FormInput
              variant="form"
              type={name === "deadline" ? "date" : "text"}
              allowDateClear={name === "deadline"}
              control={form.control}
              name={name}
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
      {previous && previous.actorId !== a.accountId && (
        <p role="alert">
          이전 총무가 만든 문서예요. 당시 계좌를 자동으로 복사하지 않았어요. 새
          안내에 사용할 계좌를 확인해 주세요.
        </p>
      )}
      <CommandStatus command={command} />
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            command.isPending ||
            command.uncertain ||
            base !== data.state.version ||
            !!data.depositConflicts?.length ||
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
  needsReview,
  onEdit,
}: {
  a: Access;
  id: string;
  needsReview: boolean;
  onEdit: (n: Notice) => void;
}) {
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const active = useActiveScreen();
  const q = useQuery(noticeQuery(a, id));
  if (q.error instanceof ApiError && [401, 403, 404].includes(q.error.status))
    return <p role="alert">정산문에 접근할 수 없습니다.</p>;
  const n = q.data;
  const reviewRequired = needsReview || n?.needsReview;
  const sharingBlocked =
    reviewRequired ||
    n?.refundRequiresRegeneration ||
    q.isFetching ||
    !!q.error ||
    sharing;
  const copy = async () => {
    if (!n || sharingBlocked || sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    setMessage("");
    try {
      await navigator.clipboard.writeText(n.text);
      if (active.current) setMessage("복사했습니다.");
    } catch {
      if (active.current)
        setMessage("복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    } finally {
      sharingRef.current = false;
      if (active.current) setSharing(false);
    }
  };
  return (
    <section className="space-y-4">
      {q.isPending && <p role="status">정산문을 불러오는 중입니다.</p>}
      {q.error && (
        <div className="space-y-3">
          <p role="alert">{safeErrorMessage(q.error)}</p>
          <Button
            variant="outline"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            정산문 다시 조회
          </Button>
        </div>
      )}
      {n && (
        <>
          <p className="text-xs leading-relaxed text-secondary">
            {new Date(n.createdAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            생성
            {reviewRequired
              ? " · 정산 재확인 필요. 연결 지출을 수정한 뒤 새 정산문을 만들어 주세요."
              : n.refundRequiresRegeneration
                ? " · 예약금 반환으로 이 정산문을 다시 만들어야 해요. 현재 내역으로 만든 정산문을 복사하거나 공유해 주세요."
                : n.outdated &&
                  " · 현재 분담액·미확인 대상·잔액 또는 총무가 달라 재생성 필요. 당시 계좌는 보존되므로 현재 총무의 계좌를 확인해 주세요."}
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-[20px] bg-choice p-5 font-sans text-base leading-relaxed">
            {n.text}
          </pre>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="brand-outline"
              disabled={sharingBlocked}
              onClick={() => void copy()}
            >
              <Image
                src="/images/settlements/copy.svg"
                width={18}
                height={18}
                alt=""
              />
              복사하기
            </Button>
            <Button
              disabled={sharingBlocked}
              onClick={async () => {
                if (sharingBlocked || sharingRef.current) return;
                if (!navigator.share) {
                  setMessage(
                    "이 브라우저는 시스템 공유를 지원하지 않습니다. 복사하기를 이용해 주세요.",
                  );
                  return;
                }
                sharingRef.current = true;
                setSharing(true);
                setMessage("");
                try {
                  await navigator.share({ title: n.title, text: n.text });
                  if (active.current)
                    setMessage(
                      "공유 창 작업을 마쳤습니다. 수신·열람 여부는 확인하지 않습니다.",
                    );
                } catch (e) {
                  if (active.current)
                    setMessage(
                      e instanceof DOMException && e.name === "AbortError"
                        ? "공유를 취소했습니다."
                        : "공유하지 못했습니다. 복사하기를 이용해 주세요.",
                    );
                } finally {
                  sharingRef.current = false;
                  if (active.current) setSharing(false);
                }
              }}
            >
              <Image
                src="/images/settlements/share.svg"
                width={18}
                height={18}
                alt=""
              />
              공유하기
            </Button>
            <Button
              className="col-span-2"
              variant="outline"
              onClick={() => onEdit(n)}
            >
              입력 내용 수정본 만들기
            </Button>
          </div>
        </>
      )}
      {sharing && <p role="status">복사·공유 작업을 처리하고 있습니다.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function NoticePanel({
  access: a,
  data,
  onFlowChange,
  createScope,
  onCreateScopeHandled,
}: {
  access: Access;
  data: Detail;
  onFlowChange?: (active: boolean) => void;
  createScope?: Notice["scope"] | null;
  onCreateScopeHandled?: () => void;
}) {
  const [editing, setEditing] = useState<Notice | "new" | null>(null),
    [id, setId] = useState<string | null>(null),
    [created, setCreated] = useState(false);
  const editingNotice = editing ?? (createScope ? "new" : null);
  if (editingNotice)
    return (
      <NoticeForm
        key={editingNotice === "new" ? "new" : editingNotice.id}
        a={a}
        data={data}
        previous={editingNotice === "new" ? undefined : editingNotice}
        initialScope={createScope ?? "ALL"}
        onClose={() => {
          setEditing(null);
          onCreateScopeHandled?.();
          onFlowChange?.(!!id);
        }}
        onCreated={(noticeId) => {
          setId(noticeId);
          setCreated(true);
          setEditing(null);
          onCreateScopeHandled?.();
        }}
      />
    );
  if (id) {
    const needsReview = !!data.depositConflicts?.length;
    const historical =
      needsReview || data.state.notices.find((n) => n.id === id)?.outdated;
    return (
      <div className="space-y-8">
        <header className="space-y-2">
          <h2 className="text-2xl font-bold">
            {created && !historical ? "정산문이 생성되었어요" : "정산문"}
          </h2>
          {!historical && (
            <p className="text-secondary">
              안내 내용을 확인하고 복사하거나 공유해 주세요.
            </p>
          )}
        </header>
        <NoticeDetail
          key={id + ":" + data.state.version}
          a={a}
          id={id}
          needsReview={needsReview}
          onEdit={setEditing}
        />
        <Button
          variant="brand-outline"
          className="w-full"
          onClick={() => {
            setId(null);
            setCreated(false);
            onFlowChange?.(false);
          }}
        >
          정산문 기록으로 가기
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <Button
        onClick={() => {
          setEditing("new");
          onFlowChange?.(true);
        }}
        disabled={
          !!data.depositConflicts?.length ||
          data.summary.drafts > 0 ||
          data.summary.status === "EMPTY"
        }
      >
        새 정산문 만들기
      </Button>
      {!!data.depositConflicts?.length && (
        <p role="alert">
          예약금 실제 잔액과 연결 지출을 재확인해 주세요. 지출 보완 전 새
          정산문을 발행할 수 없습니다.
        </p>
      )}
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
          onClick={() => {
            setCreated(false);
            setId(n.id);
            onFlowChange?.(true);
          }}
        >
          <strong>{n.title}</strong>
          <small className="block">
            {new Date(n.createdAt).toLocaleString("ko-KR")} · 계산{" "}
            {n.calculationVersion}
            {n.outdated && " · 재생성 필요"}
          </small>
        </button>
      ))}
    </div>
  );
}
