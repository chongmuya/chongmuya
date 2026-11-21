"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import { Button } from "@/shared/ui/button";
import { FormField } from "@/shared/ui/form-field";
import { IconButton } from "@/shared/ui/icon-button";
import { cn } from "@/shared/lib/cn";
import { SettlementCheckbox } from "./settlement-checkbox";
import { SettlementScreen } from "./settlement-screen";
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
  const titleId = useId();
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
  const busy = command.isPending || command.uncertain;
  const showPeople =
    data.summary.people.some((p) => p.net > 0) ||
    initialScope === "UNCONFIRMED" ||
    previous?.scope === "UNCONFIRMED";
  const fields = (
    name: "title" | "bank" | "account" | "holder" | "deadline",
    label: string,
    placeholder?: string,
  ) => (
    <FormField
      id={`${titleId}-${name}`}
      label={label}
      error={form.formState.errors[name]?.message}
      labelClassName="text-xs"
    >
      {(attributes) => (
        <FormInput
          {...attributes}
          variant="pill"
          className="shadow-control"
          type={name === "deadline" ? "date" : "text"}
          inputMode={name === "account" ? "numeric" : undefined}
          allowDateClear={name === "deadline"}
          control={form.control}
          name={name}
          placeholder={placeholder}
        />
      )}
    </FormField>
  );
  const scopePicker = (
    <fieldset className="min-w-0 space-y-4">
      <legend className="mb-4 text-label">정산 대상</legend>
      <div className="grid grid-cols-2 gap-3.5">
        {(
          [
            ["ALL", "전체"],
            ["UNCONFIRMED", "미입금자"],
          ] as const
        ).map(([scope, label]) => (
          <label
            key={scope}
            className={cn(
              "cursor-pointer rounded-pill border border-placeholder p-2.5 text-center text-sm font-medium has-focus-visible:focus-outline",
              v.scope === scope
                ? "border-brand bg-brand text-white"
                : "text-secondary",
            )}
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
      {(showPeople || v.scope === "UNCONFIRMED") && (
        <div className="space-y-4 rounded-card bg-surface p-4 shadow-card">
          <p className="flex items-center justify-between gap-2 text-xs text-secondary">
            <span>
              {v.scope === "ALL" ? "전체 정산 금액" : "미입금자 미납 금액"}
            </span>
            <strong className="text-label text-brand-ink">
              {amount.toLocaleString()}
              <span className="ml-0.5 text-xs font-normal text-placeholder">
                원
              </span>
            </strong>
          </p>
          <div className="flex justify-between px-1 text-sm font-semibold text-placeholder">
            <span>이름</span>
            <span>
              총 정산금 <span className="ml-2">입금</span>
            </span>
          </div>
          <ul
            className="max-h-[335px] overflow-y-auto text-sm"
            aria-label="정산 대상별 금액"
          >
            {data.summary.people
              .filter((p) => v.scope === "ALL" || p.remaining > 0)
              .map((p) => (
                <li
                  key={p.person.id}
                  className="flex min-h-[67px] items-center justify-between gap-3 px-1"
                >
                  <div className="min-w-0 leading-tight wrap-anywhere">
                    <p className="font-semibold">
                      {p.person.name}
                      {p.person.label ? ` (${p.person.label})` : ""}
                    </p>
                    {p.person.phoneLast4 && (
                      <small className="mt-1 block text-xs">
                        {p.person.phoneLast4}
                      </small>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <strong className="text-base font-medium">
                      {(v.scope === "ALL"
                        ? p.amount
                        : p.remaining
                      ).toLocaleString()}
                      원
                    </strong>
                    {p.remaining > 0 ? (
                      <span
                        role="img"
                        aria-label="입금 미확인"
                        className="size-7 rounded-full border border-placeholder"
                      />
                    ) : p.amount > 0 && !p.excess ? (
                      <Image
                        src="/images/settlements/check-on.svg"
                        alt="입금 확인됨"
                        width={28}
                        height={28}
                      />
                    ) : (
                      <span className="w-7 text-center text-secondary">–</span>
                    )}
                  </div>
                </li>
              ))}
          </ul>
          {amount === 0 && (
            <p className="text-sm text-secondary">
              입금 요청 없이 정산 내역을 안내해요.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
  return (
    <SettlementScreen titleId={titleId} onClose={onClose} busy={busy}>
      <form
        className="flex min-h-dvh flex-col px-[18px] pt-[max(53px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]"
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
        <header className="mb-16">
          <IconButton
            aria-label="취소"
            onClick={onClose}
            disabled={busy}
            className="-ml-2.5"
          >
            <Image src="/images/ui/back.svg" alt="" width={10} height={18} />
          </IconButton>
          <h2 id={titleId} className="mt-5 text-2xl leading-tight font-bold">
            정산문 {previous ? "수정본" : "만들기"}
          </h2>
        </header>
        <fieldset disabled={busy} className="space-y-10">
          {showPeople && scopePicker}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-label text-copy/80">계좌 정보</legend>
            {fields("bank", "은행", "예: 신한은행")}
            <div className="grid grid-cols-2 gap-3.5">
              {fields("holder", "예금주", "입금 계좌의 예금주")}
              {fields("account", "계좌번호", "계좌번호 입력")}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <SettlementCheckbox {...form.register("saveBank")} />
              계좌 정보 저장하기
            </label>
          </fieldset>
          <div>
            <FormField
              id={`${titleId}-message`}
              label="안내 메시지"
              labelClassName="mb-0.5 text-label text-copy/80"
              error={form.formState.errors.message?.message}
            >
              {(attributes) => (
                <textarea
                  {...attributes}
                  className="min-h-[100px] w-full rounded-card bg-surface p-4 text-sm leading-tight shadow-control"
                  {...form.register("message")}
                />
              )}
            </FormField>
            <p className="mt-1 text-right text-xs text-secondary">
              {v.message?.length ?? 0}/300
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <SettlementCheckbox {...form.register("includePeople")} />
              정산문에 개인별 정산 금액 포함하기
            </label>
          </div>
          <p className="flex items-start gap-2.5 rounded-control bg-choice px-4 py-3 text-xs leading-relaxed shadow-card">
            <Image
              src="/images/settlements/information.svg"
              alt=""
              width={20}
              height={20}
            />
            <span>
              입력한 계좌 정보와 안내 메시지를 바탕으로 정산문을 생성해요. 생성
              후에도 수정할 수 있어요.
            </span>
          </p>
          <details
            open={
              form.formState.errors.title || form.formState.errors.deadline
                ? true
                : undefined
            }
            className="-mt-6 space-y-3 text-sm"
          >
            <summary className="cursor-pointer text-secondary">
              제목·입금 기한{showPeople ? "" : "·대상 설정"}
            </summary>
            {fields("title", "제목")}
            {fields("deadline", "확인 기한")}
            {!showPeople && scopePicker}
          </details>
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
            이전 총무가 만든 문서예요. 당시 계좌를 자동으로 복사하지 않았어요.
            새 안내에 사용할 계좌를 확인해 주세요.
          </p>
        )}
        <CommandStatus command={command} />
        <div className="mt-auto pt-8">
          <Button
            className="w-full"
            type="submit"
            disabled={
              busy ||
              base !== data.state.version ||
              !!data.depositConflicts?.length ||
              data.summary.drafts > 0
            }
          >
            <Image
              src="/images/settlements/notice-sparkle.svg"
              alt=""
              width={21}
              height={20}
            />
            정산문 생성하기
          </Button>
        </div>
      </form>
    </SettlementScreen>
  );
}
function NoticeDetail({
  a,
  id,
  needsReview,
  onEdit,
  previewTitle,
  onOpen,
}: {
  a: Access;
  id: string;
  needsReview: boolean;
  onEdit?: (n: Notice) => void;
  previewTitle?: string;
  onOpen?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const active = useActiveScreen();
  const q = useQuery(noticeQuery(a, id));
  if (q.error instanceof ApiError && [401, 403, 404].includes(q.error.status))
    return <p role="alert">정산문에 접근할 수 없습니다.</p>;
  const n = q.data;
  const isPreview = !!onOpen;
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
      {isPreview && (
        <button
          type="button"
          aria-label={previewTitle}
          className="block w-full cursor-pointer rounded-card bg-choice px-5 py-[19px] text-left text-sm leading-tight shadow-control"
          onClick={onOpen}
        >
          {n ? (
            <span className="line-clamp-3 whitespace-pre-line wrap-anywhere">
              {n.text}
            </span>
          ) : (
            previewTitle
          )}
        </button>
      )}
      {q.isPending && !isPreview && (
        <p role="status">정산문을 불러오는 중입니다.</p>
      )}
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
          {!isPreview &&
            (reviewRequired || n.refundRequiresRegeneration || n.outdated) && (
              <p
                role="alert"
                className="rounded-control bg-choice p-3 text-xs leading-relaxed text-secondary"
              >
                {reviewRequired
                  ? "정산 재확인 필요. 연결 지출을 수정한 뒤 새 정산문을 만들어 주세요."
                  : n.refundRequiresRegeneration
                    ? "예약금 반환으로 이 정산문을 다시 만들어야 해요. 현재 내역으로 만든 정산문을 복사하거나 공유해 주세요."
                    : "현재 분담액·미확인 대상·잔액 또는 총무가 달라 재생성 필요. 당시 계좌는 보존되므로 현재 총무의 계좌를 확인해 주세요."}
              </p>
            )}
          {!isPreview && (
            <div className="relative rounded-card bg-choice shadow-control">
              <pre className="whitespace-pre-wrap wrap-anywhere p-5 font-sans text-base leading-6">
                {n.text}
              </pre>
              <button
                type="button"
                className="absolute inset-0 cursor-pointer rounded-card"
                onClick={() => onEdit?.(n)}
              >
                <span className="sr-only">입력 내용 수정본 만들기</span>
              </button>
            </div>
          )}
          <div
            className={cn(
              "flex gap-2",
              isPreview ? "justify-end" : "grid grid-cols-2",
            )}
          >
            <Button
              variant="brand-outline"
              disabled={sharingBlocked}
              className={cn(
                "border-2 text-brand",
                isPreview && "min-h-8 px-4 py-0 text-xs font-normal",
              )}
              onClick={() => void copy()}
            >
              <Image
                src="/images/settlements/copy.svg"
                width={isPreview ? 18 : 26}
                height={isPreview ? 18 : 26}
                alt=""
              />
              {isPreview ? "복사" : "복사하기"}
            </Button>
            <Button
              disabled={sharingBlocked}
              className={
                isPreview ? "min-h-8 px-4 py-0 text-xs font-normal" : undefined
              }
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
                width={isPreview ? 18 : 26}
                height={isPreview ? 18 : 26}
                alt=""
              />
              {isPreview ? "공유" : "공유하기"}
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
  active = true,
}: {
  access: Access;
  data: Detail;
  onFlowChange?: (active: boolean) => void;
  createScope?: Notice["scope"] | null;
  onCreateScopeHandled?: () => void;
  active?: boolean;
}) {
  const titleId = useId();
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
  const closeDetail = () => {
    setId(null);
    setCreated(false);
    onFlowChange?.(false);
  };
  if (id) {
    const selected = data.state.notices.find((notice) => notice.id === id);
    const showCreated = created && !selected?.outdated;
    return (
      <SettlementScreen titleId={titleId} onClose={closeDetail}>
        <div className="flex min-h-dvh flex-col px-[18px] pt-[max(53px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
          <header className="mb-16">
            <IconButton
              aria-label="정산문 기록으로 돌아가기"
              onClick={closeDetail}
              className="-ml-2.5"
            >
              <Image src="/images/ui/back.svg" alt="" width={10} height={18} />
            </IconButton>
            <h2 id={titleId} className="mt-5 text-2xl leading-tight font-bold">
              {showCreated
                ? "정산문이 생성되었어요"
                : (selected?.title ?? "정산문")}
            </h2>
            {showCreated && (
              <p className="mt-1 text-secondary">
                생성된 정산문을 클릭해 수정할 수 있어요.
              </p>
            )}
          </header>
          <NoticeDetail
            key={`${id}:${data.state.version}`}
            a={a}
            id={id}
            needsReview={!!data.depositConflicts?.length}
            onEdit={setEditing}
          />
          {showCreated && (
            <footer className="mt-auto pt-[67px]">
              <Button
                variant="brand-outline"
                className="w-full border-2 text-brand"
                onClick={closeDetail}
              >
                정산문 기록으로 가기
              </Button>
            </footer>
          )}
        </div>
      </SettlementScreen>
    );
  }
  const latest = data.state.notices.at(-1);
  const createNotice = (
    <Button
      className="min-h-[46px] gap-5 rounded-control px-3.5 text-xs font-medium"
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
      {latest ? "새 정산문 만들기" : "정산문 만들기"}
      <Image
        className="rotate-180"
        src="/images/settlements/notice-next.svg"
        alt=""
        width={14}
        height={11}
      />
    </Button>
  );
  const open = (noticeId: string) => {
    setCreated(false);
    setId(noticeId);
    onFlowChange?.(true);
  };
  return (
    <div className="space-y-4 px-[22px]">
      {latest ? (
        <>
          <div className="flex justify-end">{createNotice}</div>
          <div>
            <h2 className="mb-2 text-label text-copy/80">작성한 정산문</h2>
            {active && (
              <NoticeDetail
                key={`${latest.id}:${data.state.version}`}
                a={a}
                id={latest.id}
                previewTitle={latest.title}
                onOpen={() => open(latest.id)}
                needsReview={!!data.depositConflicts?.length}
              />
            )}
          </div>
          {data.state.notices.length > 1 && (
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm text-secondary">
                이전 정산문
              </summary>
              <ul className="space-y-2">
                {data.state.notices
                  .slice(0, -1)
                  .reverse()
                  .map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className="w-full cursor-pointer rounded-control bg-choice px-4 py-2 text-left"
                        onClick={() => open(n.id)}
                      >
                        {n.title}
                        <small className="block text-secondary">
                          {new Date(n.createdAt).toLocaleDateString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })}
                          {n.outdated && " · 재생성 필요"}
                        </small>
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <div className="py-8 text-center">
          <div className="mx-auto grid size-[85px] place-items-center rounded-full bg-[radial-gradient(ellipse_at_96%_78%,#ffdd99,#f46224_85%)]">
            <Image
              src="/images/settlements/notice-empty.svg"
              alt=""
              width={41}
              height={41}
            />
          </div>
          <h2 className="mt-6 text-2xl leading-tight font-bold">
            아직 생성된 정산문이 없어요
          </h2>
          <p className="mx-auto mt-4 max-w-56 text-xs leading-tight">
            입금 안내 메시지를 자동으로 만들어 참여자에게 바로 공유해 보세요.
          </p>
          <div className="mt-4">{createNotice}</div>
        </div>
      )}
      {!!data.depositConflicts?.length && (
        <p role="alert" className="text-sm text-danger">
          예약금 실제 잔액과 연결 지출을 재확인해 주세요. 지출 보완 전 새
          정산문을 발행할 수 없습니다.
        </p>
      )}
      {data.summary.drafts > 0 && (
        <p role="alert" className="text-sm text-danger">
          미완성 지출 {data.summary.drafts}개를 먼저 완료해 주세요.
        </p>
      )}
    </div>
  );
}
