"use client";
import { useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/client";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
import {
  saveProfile,
  issuePhone,
  verifyPhone,
  termsQuery,
  type PhoneChange,
} from "../api/account.api";
import { profileSchema, phoneSchema } from "../schemas/profile";
export function useAccountSettings() {
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
  const terms = useQuery(termsQuery(request, account?.id));
  return {
    account,
    profile,
    save,
    phone,
    issue,
    issuing,
    checking,
    issueError,
    proof,
    verify,
    setProof,
    waiting,
    verifyError,
    done,
    terms,
  };
}
