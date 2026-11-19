"use client";
import { useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ErrorState } from "@/shared/ui/states";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import {
  saveProfile,
  issuePhone,
  verifyPhone,
  getTerms,
  type PhoneChange,
} from "../api/account.api";
import { profileSchema, phoneSchema } from "../schemas/profile";
export function AccountSettings() {
  const { account, client } = useAuth();
  const request = useMemo(() => client.request.bind(client), [client]);
  const active = useActiveScreen();
  const [proof, setProof] = useState<PhoneChange>();
  const [done, setDone] = useState(false);
  const profile = useForm({
      resolver: zodResolver(profileSchema),
      defaultValues: {
        name: account?.name ?? "",
        nickname: account?.nickname ?? "",
      },
    }),
    phone = useForm({
      resolver: zodResolver(phoneSchema),
      defaultValues: { phone: "" },
    });
  const save = useMutation({
    mutationFn: (v: { name: string; nickname: string }) =>
      saveProfile(request, {
        name: v.name,
        ...(account?.accountType === "organizer" && v.nickname.trim()
          ? { nickname: v.nickname }
          : {}),
      }),
    onSuccess: (a) => {
      if (active.current) client.applyProfile(a, "profile");
    },
    retry: false,
  });
  const phoneBusy = useRef(false);
  const [issuing, setIssuing] = useState(false),
    [checking, setChecking] = useState(false),
    [issueError, setIssueError] = useState(false),
    [verifyError, setVerifyError] = useState(false),
    [waiting, setWaiting] = useState(false);
  const issue = async (v: { phone: string }) => {
    if (phoneBusy.current) return;
    phoneBusy.current = true;
    setIssuing(true);
    setIssueError(false);
    try {
      const p = await issuePhone(request, v.phone);
      if (active.current) {
        setProof(p);
        setDone(false);
        setWaiting(false);
      }
    } catch {
      if (active.current) setIssueError(true);
    } finally {
      phoneBusy.current = false;
      if (active.current) setIssuing(false);
    }
  };
  const verify = async () => {
    if (phoneBusy.current || !proof) return;
    phoneBusy.current = true;
    setChecking(true);
    setVerifyError(false);
    try {
      const r = await verifyPhone(request, proof);
      if (active.current) {
        if (r.account) {
          client.applyProfile(r.account, "phone");
          setDone(true);
          setProof(undefined);
        } else setWaiting(true);
      }
    } catch {
      if (active.current) setVerifyError(true);
    } finally {
      phoneBusy.current = false;
      if (active.current) setChecking(false);
    }
  };
  const terms = useQuery({
    queryKey: ["user", account?.id, "account", "terms"],
    queryFn: ({ signal }) => getTerms(request, signal),
    retry: false,
  });
  if (!account) return null;
  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={profile.handleSubmit((v) => save.mutate(v))}
      >
        <h2 className="text-xl font-bold">프로필 수정</h2>
        <p>
          {account.email} ·{" "}
          {account.accountType === "owner" ? "사장님" : "총무"}
        </p>
        {(
          [
            "name",
            ...(account.accountType === "organizer"
              ? (["nickname"] as const)
              : []),
          ] as const
        ).map((field) => (
          <div key={field}>
            <label htmlFor={field}>
              {field === "name" ? "이름" : "총무 닉네임"}
            </label>
            <Input
              id={field}
              {...profile.register(field)}
              aria-invalid={!!profile.formState.errors[field]}
              aria-describedby={`${field}-error`}
            />
            {field === "nickname" && (
              <p className="text-xs text-muted">
                비워두면 기존 닉네임을 유지해요.
              </p>
            )}
            <p id={`${field}-error`} role="alert">
              {profile.formState.errors[field]?.message}
            </p>
          </div>
        ))}
        {save.isError && (
          <p role="alert">
            프로필을 저장하지 못했어요. 입력을 확인하고 다시 시도해 주세요.
          </p>
        )}
        {save.isSuccess && <p role="status">프로필을 저장했어요.</p>}
        <Button type="submit" disabled={save.isPending}>
          프로필 저장
        </Button>
      </form>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">연락처 인증 및 변경</h2>
        <p>
          현재 연락처: {account.phone ?? "등록된 번호 없음"}{" "}
          {account.phoneVerifiedAt ? "(인증됨)" : "(미인증)"}
        </p>
        <p className="text-xs text-muted">
          앞으로 생성하는 문의·운영 연락에 사용돼요. 기존 문의·예약의 당시
          연락처와 매장 담당자 연락처는 별도로 유지돼요.
        </p>
        <form
          onSubmit={(event) =>
            void phone.handleSubmit((v) => void issue(v))(event)
          }
          className="space-y-3"
        >
          <label htmlFor="new-phone">새 휴대폰 번호</label>
          <Input
            id="new-phone"
            type="tel"
            {...phone.register("phone")}
            aria-invalid={!!phone.formState.errors.phone}
            aria-describedby="phone-error"
          />
          <p id="phone-error" role="alert">
            {phone.formState.errors.phone?.message}
          </p>
          <Button type="submit" disabled={issuing || checking}>
            변경용 인증 시작
          </Button>
        </form>
        {issueError && (
          <p role="alert">
            인증을 시작하지 못했어요. 설정 또는 재요청 가능 시간을 확인한 뒤
            다시 시도해 주세요.
          </p>
        )}
        {proof && (
          <div className="space-y-3 rounded-control bg-surface p-4">
            <p>
              {proof.phone}에서 {proof.receiver}로 아래 문자를 직접 보내 주세요.
            </p>
            <p className="break-all">{proof.message}</p>
            <a
              className="underline"
              href={`sms:${proof.receiver}?body=${encodeURIComponent(proof.message)}`}
            >
              문자 앱 열기
            </a>
            <p className="text-xs">
              만료: {new Date(proof.expiresAt).toLocaleTimeString("ko-KR")} ·
              발송 후 잠시 기다려 주세요.
            </p>
            <Button
              disabled={checking || issuing}
              onClick={() => void verify()}
            >
              인증 확인 및 번호 변경
            </Button>
            <Button variant="outline" onClick={() => setProof(undefined)}>
              입력으로 돌아가기
            </Button>
            {waiting && <p>아직 인증 문자를 확인하지 못했어요.</p>}
          </div>
        )}
        {verifyError && (
          <p role="alert">
            인증 결과를 확인하지 못했어요. 증명이 만료되지 않았다면 같은
            인증으로 다시 확인해 주세요.
          </p>
        )}
        {done && <p role="status">인증된 연락처로 변경했어요.</p>}
      </section>
      <section id="terms" className="space-y-3">
        <h2 className="text-xl font-bold">약관 및 개인정보 처리방침</h2>
        {terms.isError && (
          <ErrorState retry={() => void terms.refetch()} />
        )}{" "}
        {terms.data?.terms.map((t) => (
          <details key={t.id}>
            <summary>
              {t.title} · {t.version}
            </summary>
            {t.draft && (
              <p>
                현재 서버의 초안 문서입니다. 운영 문서 설정 확인이 필요해요.
              </p>
            )}
            {t.url ? (
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                문서 열기
              </a>
            ) : (
              t.body.map((line, i) => <p key={i}>{line}</p>)
            )}
          </details>
        ))}
      </section>
    </div>
  );
}
