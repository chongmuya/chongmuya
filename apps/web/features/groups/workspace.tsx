"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/http/api-error";

type Request = <T>(
  path: `/api/v1/${string}`,
  options?: RequestInit,
) => Promise<T>;
type Group = { id: string; name: string };
type Event = Group & { groupId: string; scheduledAt: string | null };
export const eventsUrl = (id: string) =>
  `/events?group=${encodeURIComponent(id)}`;
function useActiveScreen() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}
function Failure({ retry }: { retry: () => void }) {
  return (
    <div role="alert">
      <p>정보를 불러오지 못했습니다. 연결과 접근 권한을 확인해 주세요.</p>
      <button onClick={retry}>다시 시도</button>
    </div>
  );
}
function NameForm({
  title,
  initial = "",
  schedule = false,
  save,
}: {
  title: string;
  initial?: string;
  schedule?: boolean;
  save: (name: string, scheduledAt?: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        const form = e.currentTarget;
        const values = new FormData(form);
        const name = String(values.get("name") ?? "").trim();
        if (!name) {
          setMessage("이름을 입력해 주세요.");
          return;
        }
        setPending(true);
        setMessage("");
        try {
          const date = String(values.get("date") ?? "");
          await save(
            name,
            date ? new Date(`${date}+09:00`).toISOString() : undefined,
          );
          form.reset();
          setMessage("저장했습니다.");
        } catch (error) {
          setMessage(
            error instanceof ApiError && error.status === 400
              ? "입력한 이름과 일정을 확인해 주세요."
              : "저장하지 못했습니다. 연결과 권한을 확인하고 다시 시도해 주세요.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <h2>{title}</h2>
      <label>
        {" "}
        {schedule ? "행사명" : "모임 이름"}
        <input
          name="name"
          defaultValue={initial}
          required
          maxLength={100}
          disabled={pending}
        />
      </label>
      {schedule && (
        <label>
          일정 (선택 · 한국 시간)
          <input name="date" type="datetime-local" disabled={pending} />
        </label>
      )}
      <button disabled={pending} aria-busy={pending}>
        {pending ? "저장 중…" : title}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export function Workspace({
  accountId,
  request,
  groupId,
  eventId,
  mode,
}: {
  accountId: string;
  request: Request;
  groupId: string | null;
  eventId: string | null;
  mode: "events" | "mypage" | "onboarding";
}) {
  const router = useRouter();
  const active = useActiveScreen();
  const cache = useQueryClient();
  const key = ["user", accountId, "groups"];
  const groups = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => request<Group[]>("/api/v1/groups", { signal }),
    retry: false,
  });
  const selected =
    groups.data?.find((g) => g.id === groupId) ??
    (!groupId ? groups.data?.[0] : undefined);
  useEffect(() => {
    if (!groups.isError && groups.data?.length && mode === "onboarding")
      router.replace(eventsUrl(groups.data[0].id));
  }, [groups.data, groups.isError, mode, router]);
  const create = async (name: string) => {
    const group = await request<Group>("/api/v1/groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!active.current) return;
    cache.setQueryData<Group[]>(key, (previous) => [
      ...(previous ?? []),
      group,
    ]);
    router.replace(eventsUrl(group.id));
  };
  if (groups.isError) return <Failure retry={() => void groups.refetch()} />;
  if (!groups.data) return <p role="status">모임 확인 중…</p>;
  if (!groups.data.length)
    return (
      <section>
        <h1>첫 모임을 만들어 주세요</h1>
        <p>모임 이름만 있으면 시작할 수 있어요.</p>
        <NameForm title="모임 만들기" save={create} />
      </section>
    );
  if (!selected)
    return (
      <section>
        <h1>접근할 수 없는 모임입니다</h1>
        <Link href="/events">내 모임으로 돌아가기</Link>
      </section>
    );
  return (
    <section>
      <nav>
        <Link href={eventsUrl(selected.id)}>행사 목록</Link>
        <Link href={`/mypage?group=${selected.id}`}>마이페이지</Link>
      </nav>
      <h1>{selected.name}</h1>
      {mode === "mypage" ? (
        <>
          <h2>관리할 모임 전환</h2>
          <ul>
            {groups.data.map((g) => (
              <li key={g.id}>
                <Link
                  aria-current={g.id === selected.id ? "true" : undefined}
                  href={eventsUrl(g.id)}
                >
                  {g.name}
                  {g.id === selected.id ? " (현재 모임)" : ""}
                </Link>
              </li>
            ))}
          </ul>
          <NameForm
            key={selected.id + selected.name}
            title="모임 이름 수정"
            initial={selected.name}
            save={async (name) => {
              const group = await request<Group>(
                `/api/v1/groups/${selected.id}`,
                { method: "PATCH", body: JSON.stringify({ name }) },
              );
              if (!active.current) return;
              cache.setQueryData<Group[]>(key, (previous) =>
                previous?.map((g) => (g.id === group.id ? group : g)),
              );
            }}
          />
          <NameForm title="모임 추가" save={create} />
        </>
      ) : (
        <Events
          key={selected.id}
          accountId={accountId}
          request={request}
          groupId={selected.id}
          eventId={eventId}
        />
      )}
    </section>
  );
}
function Events({
  accountId,
  request,
  groupId,
  eventId,
}: {
  accountId: string;
  request: Request;
  groupId: string;
  eventId: string | null;
}) {
  const router = useRouter();
  const active = useActiveScreen();
  const cache = useQueryClient();
  const path = `/api/v1/groups/${encodeURIComponent(groupId)}/events` as const;
  const key = ["user", accountId, "groups", groupId, "events"];
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => request<Event[]>(path, { signal }),
    enabled: !eventId,
    retry: false,
  });
  const detail = useQuery({
    queryKey: [...key, eventId],
    queryFn: ({ signal }) =>
      request<Event>(`${path}/${encodeURIComponent(eventId!)}`, { signal }),
    enabled: !!eventId,
    retry: false,
  });
  if (eventId) {
    if (detail.isError) return <Failure retry={() => void detail.refetch()} />;
    if (!detail.data) return <p role="status">행사 확인 중…</p>;
    return (
      <article>
        <h2>{detail.data.name}</h2>
        <p>{dateLabel(detail.data.scheduledAt)}</p>
        <p>명단과 예약 없이 만든 행사입니다. 행사 준비를 시작해 보세요.</p>
      </article>
    );
  }
  return (
    <>
      <NameForm
        title="행사 만들기"
        schedule
        save={async (name, scheduledAt) => {
          const event = await request<Event>(path, {
            method: "POST",
            body: JSON.stringify({ name, scheduledAt }),
          });
          if (!active.current) return;
          await cache.invalidateQueries({ queryKey: key });
          if (!active.current) return;
          router.push(`${eventsUrl(groupId)}&event=${event.id}`);
        }}
      />
      <h2>행사 목록</h2>
      {list.isError ? (
        <Failure retry={() => void list.refetch()} />
      ) : !list.data ? (
        <p role="status">행사 불러오는 중…</p>
      ) : !list.data.length ? (
        <p>아직 행사가 없어요. 행사명만 입력해 첫 행사를 만들어 보세요.</p>
      ) : (
        <ul>
          {list.data.map((event) => (
            <li key={event.id}>
              <Link href={`${eventsUrl(groupId)}&event=${event.id}`}>
                {event.name}
              </Link>
              <p>{dateLabel(event.scheduledAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
function dateLabel(value: string | null) {
  return value
    ? `${new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value))} (한국 시간)`
    : "일정 미정";
}
