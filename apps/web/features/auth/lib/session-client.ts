import { ApiError } from "../../../shared/http/api-error";
import { requestJson } from "../../../shared/http/request";

import type { Account, AuthState, Session } from "../types/auth.types";
import type {
  SignupRequest,
  FirstSetupInput,
  KakaoSignupRequest,
} from "../types/signup.types";
type Transport = typeof requestJson;
type Lock = <T>(action: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

// Instance belongs to the mounted provider, never to a server-wide singleton.
export class SessionClient {
  readonly instanceId = crypto.randomUUID();
  private resourceGroups = new Map<string, string>();
  private authorityRevisions = new Map<string, number>();
  private authorityClock = 0;
  private resource(path: string) {
    return /^\/api\/v1\/(?:groups|events|calendar|reservations)\/([^/?]+)/.exec(
      path,
    )?.[1];
  }
  private remember(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) this.remember(item);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && typeof record.groupId === "string")
      this.resourceGroups.set(record.id, record.groupId);
    for (const item of Object.values(record))
      if (item && typeof item === "object") this.remember(item);
  }
  notifyAuthorityChange(groupId: string) {
    const accountId = this.state.account?.id;
    if (!accountId) return;
    const channel = new BroadcastChannel("chongmuya-group-authority");
    channel.postMessage({ source: this.instanceId, accountId, groupId });
    channel.close();
  }
  receiveAuthorityChange(value: unknown) {
    if (!value || typeof value !== "object") return;
    const event = value as Record<string, unknown>;
    if (
      event.source === this.instanceId ||
      event.accountId !== this.state.account?.id ||
      typeof event.groupId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(event.groupId)
    )
      return;
    this.invalidateAuthority(event.groupId, false);
  }
  private readonly serverSnapshot: AuthState = {
    status: "loading",
    account: null,
  };
  private state: AuthState = this.serverSnapshot;
  private listeners = new Set<() => void>();
  private restoring?: Promise<void>;
  private refreshing?: Promise<void>;
  private preparingSignup?: Promise<void>;
  private authenticating?: Promise<Session>;
  private generation = 0;
  private revision = 0;
  // Same-account profile writes do not rotate credentials or invalidate requests.
  private profileRevision = 0;
  private ending = false;
  constructor(
    private readonly clearUserCache: () => void,
    private readonly transport: Transport = requestJson,
    private readonly lock: Lock = (action) => action(),
    private readonly onAuthorityLost: (
      accountId: string,
      resourceIds: string[],
      denied: boolean,
    ) => void = () => undefined,
  ) {}
  invalidateAuthority = (resourceId: string, denied = true) => {
    const accountId = this.state.account?.id;
    if (!accountId) return;
    const group = this.resourceGroups.get(resourceId) ?? resourceId;
    const ids = [
      group,
      resourceId,
      ...[...this.resourceGroups]
        .filter(([, g]) => g === group)
        .map(([id]) => id),
    ];
    this.authorityClock++;
    for (const id of new Set(ids))
      this.authorityRevisions.set(id, this.authorityClock);
    this.onAuthorityLost(accountId, [...new Set(ids)], denied);
  };
  getSnapshot = () => this.state;
  // A delayed Suspense boundary must hydrate the same loading markup even
  // when session restoration has already finished elsewhere in the tree.
  getServerSnapshot = () => this.serverSnapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(state: AuthState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private apply(session: Session, readProfileRevision = this.profileRevision) {
    const account =
      session.authenticated &&
      session.account?.id === this.state.account?.id &&
      readProfileRevision !== this.profileRevision
        ? this.state.account
        : session.account;
    if (this.state.account?.id !== session.account?.id && this.state.account) {
      this.generation++;
      this.resourceGroups.clear();
      this.authorityRevisions.clear();
      this.clearUserCache();
    }
    this.set({
      status: session.authenticated ? "authenticated" : "anonymous",
      account,
    });
  }
  private invalid() {
    this.generation++;
    this.clearUserCache();
    this.set({ status: "anonymous", account: null });
  }
  restore = (): Promise<void> => {
    if (this.ending) return Promise.resolve();
    if (!this.restoring) {
      this.restoring = this.restoreSession().finally(() => {
        this.restoring = undefined;
      });
    }
    return this.restoring;
  };
  private async restoreSession() {
    const generation = this.generation;
    try {
      // The request's timeout starts only after the tab acquires the lock.
      const signal = AbortSignal.timeout(10_000);
      await this.lock(async () => {
        if (generation !== this.generation) return;
        signal.throwIfAborted();
        const profileRevision = this.profileRevision;
        const session = await this.transport<Session>(
          "/api/v1/auth/session/restore",
          { method: "POST" },
        );
        if (generation === this.generation)
          this.apply(session, profileRevision);
      }, signal);
    } catch (error) {
      if (generation === this.generation)
        this.set({ status: "unavailable", account: this.state.account });
      throw error;
    }
  }
  private refresh() {
    if (!this.refreshing) {
      const generation = this.generation;
      this.refreshing = this.lock(async () => {
        if (generation !== this.generation || this.ending)
          throw new ApiError("세션이 종료되었습니다.", 401, "SESSION_INVALID");
        // Another tab may have refreshed while this tab waited for the Web Lock.
        let session: Session;
        let profileRevision = this.profileRevision;
        try {
          const account = await this.transport<Account>("/api/v1/auth/me");
          session = { authenticated: true, account };
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== "ACCESS_EXPIRED")
            throw error;
          // Logout or another account change can happen while /me is in flight.
          if (generation !== this.generation || this.ending)
            throw new ApiError(
              "세션이 변경되었습니다.",
              401,
              "SESSION_INVALID",
            );
          profileRevision = this.profileRevision;
          session = await this.transport<Session>("/api/v1/auth/refresh", {
            method: "POST",
          });
        }
        if (generation !== this.generation || this.ending)
          throw new ApiError("세션이 변경되었습니다.", 401, "SESSION_INVALID");
        // Apply identity before allowing retries. A different account advances
        // generation and clears user data, so every old request stops below.
        this.apply(session, profileRevision);
        this.revision++;
      }).finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }
  async request<T>(
    path: `/api/v1/${string}`,
    options: RequestInit = {},
    timeoutMs?: number,
  ): Promise<T> {
    const generation = this.generation;
    const revision = this.revision;
    const resourceId = this.resource(path);
    const authorityRevision = this.authorityClock;
    if (this.ending)
      throw new ApiError("로그아웃 처리 중입니다.", 401, "SESSION_INVALID");
    try {
      let result: T;
      try {
        result = await this.transport<T>(path, options, timeoutMs);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "ACCESS_EXPIRED")
          throw error;
        if (generation !== this.generation || this.ending)
          throw new ApiError("세션이 변경되었습니다.", 401, "SESSION_INVALID");
        if (revision === this.revision) await this.refresh();
        if (generation !== this.generation || this.ending)
          throw new ApiError("세션이 종료되었습니다.", 401, "SESSION_INVALID");
        result = await this.transport<T>(path, options, timeoutMs); // One retry only.
      }
      if (generation !== this.generation)
        throw new ApiError("세션이 변경되었습니다.", 401, "SESSION_INVALID");
      this.remember(result);
      if (
        resourceId &&
        Math.max(
          this.authorityRevisions.get(resourceId) ?? 0,
          this.authorityRevisions.get(
            this.resourceGroups.get(resourceId) ?? "",
          ) ?? 0,
        ) > authorityRevision
      )
        throw new ApiError(
          "관리 권한을 다시 확인해 주세요.",
          403,
          "GROUP_AUTHORITY_STALE",
        );
      return result;
    } catch (error) {
      if (
        generation === this.generation &&
        resourceId &&
        authorityRevision >= (this.authorityRevisions.get(resourceId) ?? 0) &&
        error instanceof ApiError &&
        error.code === "GROUP_AUTHORITY_CHANGED"
      )
        this.invalidateAuthority(resourceId);
      if (
        generation === this.generation &&
        error instanceof ApiError &&
        error.code === "SESSION_INVALID"
      )
        this.invalid();
      throw error;
    }
  }
  prepareSignup = (): Promise<void> => {
    if (!this.preparingSignup) {
      this.preparingSignup = this.lock(() =>
        this.request<void>("/api/v1/auth/signup/context", { method: "POST" }),
      ).finally(() => {
        this.preparingSignup = undefined;
      });
    }
    return this.preparingSignup;
  };
  applyProfile(account: Account, changed: "profile" | "phone") {
    if (
      this.ending ||
      this.state.status !== "authenticated" ||
      this.state.account?.id !== account.id
    )
      return;
    this.profileRevision++;
    const current = this.state.account!;
    const patch =
      changed === "profile"
        ? { name: account.name, nickname: account.nickname }
        : { phone: account.phone, phoneVerifiedAt: account.phoneVerifiedAt };
    this.apply({ authenticated: true, account: { ...current, ...patch } });
  }
  async saveFirstSetup(input: FirstSetupInput, signal: AbortSignal) {
    const generation = this.generation,
      accountId = this.state.account?.id;
    if (this.state.status !== "authenticated" || !accountId)
      throw new ApiError("", 401, "SESSION_INVALID");
    const account = await this.request<Account>("/api/v1/auth/first-setup", {
      method: "PATCH",
      body: JSON.stringify(input),
      signal,
    });
    if (
      signal.aborted ||
      generation !== this.generation ||
      this.ending ||
      this.state.account?.id !== accountId
    )
      throw new ApiError("", 401, "SESSION_INVALID");
    if (account.id !== accountId)
      throw new ApiError("", 200, "INVALID_RESPONSE");
    this.profileRevision++;
    this.apply({ authenticated: true, account });
    return account;
  }
  async login(email: string, password: string) {
    await this.authenticate("login", { email, password });
  }
  async signup(input: SignupRequest, signal: AbortSignal) {
    return this.authenticate("signup", input, signal);
  }
  async kakaoLogin(signal: AbortSignal) {
    return this.authenticate("kakao/login", {}, signal);
  }
  async kakaoSignup(input: KakaoSignupRequest, signal: AbortSignal) {
    return this.authenticate("kakao/signup", input, signal);
  }
  private async authenticate(
    kind: "login" | "signup" | "kakao/login" | "kakao/signup",
    input: object,
    signal?: AbortSignal,
  ) {
    const generation = ++this.generation;
    const pending = this.lock(() => {
      if (signal?.aborted || generation !== this.generation || this.ending)
        throw new ApiError("요청이 취소되었습니다.", 401, "SESSION_INVALID");
      return this.transport<Session>(`/api/v1/auth/${kind}`, {
        method: "POST",
        body: JSON.stringify(input),
        signal,
      });
    });
    this.authenticating = pending;
    try {
      const session = await pending;
      if (signal?.aborted || generation !== this.generation || this.ending)
        throw new ApiError("세션이 변경되었습니다.", 401, "SESSION_INVALID");
      if (!session.authenticated || !session.account)
        throw new ApiError(
          "응답 형식이 올바르지 않습니다.",
          200,
          "INVALID_RESPONSE",
        );
      this.ending = false;
      this.clearUserCache();
      this.apply(session);
      return session.account;
    } finally {
      if (this.authenticating === pending) this.authenticating = undefined;
    }
  }
  endWithdrawnSession(accountId: string) {
    if (this.state.account?.id !== accountId) return;
    this.resourceGroups.clear();
    this.authorityRevisions.clear();
    this.invalid();
  }
  async logout() {
    this.ending = true;
    ++this.generation;
    this.clearUserCache();
    this.set({ status: "logging-out", account: null });
    try {
      // Wait for cookie-setting work, then revoke the resulting session and clear cookies.
      await Promise.allSettled([
        this.restoring,
        this.refreshing,
        this.authenticating,
      ]);
      await this.lock(() =>
        this.transport<void>("/api/v1/auth/logout", { method: "POST" }),
      );
      this.set({ status: "anonymous", account: null });
      this.ending = false;
    } catch (error) {
      // Keep ending=true: a failed logout must not silently restore authentication.
      this.set({ status: "logout-failed", account: null });
      throw error;
    }
  }
}
