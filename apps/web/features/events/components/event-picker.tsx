"use client";
import { useQuery } from "@tanstack/react-query";
import type { SessionRequest } from "@/features/auth/types";
import { Button } from "@/shared/ui/button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { eventsQueryOptions } from "../api/events.queries";
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
  return (
    <>
      {result.isError ? (
        <ErrorState retry={() => void result.refetch()} />
      ) : !result.data ? (
        <LoadingState>내 행사 확인 중…</LoadingState>
      ) : !result.data.length ? (
        <p className="text-sm text-muted">
          아직 행사가 없어요. 모임 없이 개인 행사를 만들어 문의할 수 있어요.
        </p>
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
      <EventForm
        accountId={accountId}
        request={request}
        onCreated={(e) => onSelect(e.id)}
      />
    </>
  );
}
