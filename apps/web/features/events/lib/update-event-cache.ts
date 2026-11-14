import type { QueryClient } from "@tanstack/react-query";
import { eventKeys } from "../api/events.queries";
import type { Event } from "../types/event.types";

// Creation and linking share the same affected scopes. A stale read must not
// replace the returned event, or recreate a user cache after leaving the page.
export async function updateEventCache(
  cache: QueryClient,
  accountId: string,
  event: Event,
  active: { current: boolean },
) {
  if (!active.current) return;
  const lists = [
    eventKeys.list(accountId),
    ...(event.groupId ? [eventKeys.list(accountId, event.groupId)] : []),
  ];
  const detail = eventKeys.detail(accountId, event.id);
  await Promise.all(
    [...lists, detail].map((queryKey) =>
      cache.cancelQueries({ queryKey, exact: true }),
    ),
  );
  if (!active.current) return;
  for (const queryKey of lists) {
    cache.setQueryData<Event[]>(queryKey, (old) =>
      old?.map((item) => (item.id === event.id ? event : item)),
    );
  }
  cache.setQueryData(detail, event);
  await Promise.all(
    lists.map((queryKey) => cache.invalidateQueries({ queryKey, exact: true })),
  );
}
