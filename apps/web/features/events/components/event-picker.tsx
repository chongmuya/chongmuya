"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { eventsQueryOptions } from "../api/events.queries";
import { StepHeading } from "@/shared/ui/step-layout";
import { EventForm } from "./event-form";

export function EventPicker({
  accountId,
  request,
  onSelect,
}: {
  accountId: string;
  request: SessionRequest;
  onSelect: (id: string) => void;
}) {
  const result = useQuery(eventsQueryOptions(accountId, request));
  const [creating, setCreating] = useState(false);
  if (creating || result.data?.length === 0)
    return (
      <EventForm
        accountId={accountId}
        request={request}
        onCreated={(event) => onSelect(event.id)}
      />
    );
  return (
    <>
      <StepHeading title="어떤 행사로 문의할까요?" />
      {result.isError ? (
        <ErrorState retry={() => void result.refetch()} />
      ) : !result.data ? (
        <LoadingState>내 행사 확인 중…</LoadingState>
      ) : (
        <ul className="space-y-3">
          {result.data.map((e) => (
            <li key={e.id}>
              <Button
                variant="outline"
                className="w-full justify-between rounded-control bg-surface text-left"
                onClick={() => onSelect(e.id)}
              >
                {e.name}
                <span aria-hidden="true">→</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        className="mt-5 w-full"
        onClick={() => setCreating(true)}
      >
        새 행사 만들기
      </Button>
    </>
  );
}
