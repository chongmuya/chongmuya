"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { memberSchema } from "../schemas/member.schema";
import { updateMember } from "../api/groups.api";
import type { SessionRequest } from "@/features/auth/types";
import type { GroupMember } from "../types/group.types";
import { ApiError } from "@/shared/http/api-error";
import { useActiveScreen } from "@/shared/hooks/use-active-screen";
export function useEditMember(
  member: GroupMember,
  groupId: string,
  request: SessionRequest,
  refresh: () => void,
  onClose: () => void,
) {
  const active = useActiveScreen();
  const [base, setBase] = useState(member);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<object | undefined>(undefined);
  const form = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: member.name,
      phoneLast4: member.phoneLast4 ?? "",
      label: member.label ?? "",
      exclude: false,
      duplicatesConfirmed: false,
    },
  });
  const save = useMutation({
    mutationFn: (body: object) =>
      updateMember(request, groupId, member.id, body),
    retry: false,
    networkMode: "always",
    onSuccess: () => {
      if (active.current) {
        refresh();
        onClose();
      }
    },
    onError: (e) => {
      if (active.current) {
        const u = !(e instanceof ApiError) || e.status < 400 || e.status >= 500;
        setUncertain(u);
        if (!u) {
          pending.current = undefined;
          refresh();
        }
      }
    },
  });
  return { base, setBase, uncertain, pending, form, save };
}
