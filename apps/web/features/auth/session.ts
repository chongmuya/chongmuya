import { ApiError } from "../../shared/http/api-error";
import { requestJson } from "../../shared/http/request";

export type Account = { id: string; email: string };
export type Session = { authenticated: boolean; account: Account | null };
export type AuthState = {
  status:
    "loading" | "anonymous" | "authenticated" | "unavailable" | "logging-out";
  account: Account | null;
};
type Transport = typeof requestJson;
type Lock = <T>(action: () => Promise<T>) => Promise<T>;

// Instance belongs to the mounted provider, never to a server-wide singleton.
export class SessionClient {
  private state: AuthState = { status: "loading", account: null };
  private listeners = new Set<() => void>();
  private restoring?: Promise<void>;
  private refreshing?: Promise<void>;
  private generation = 0;
  private revision = 0;
  private ending = false;
  constructor(
    private readonly clearUserCache: () => void,
    private readonly transport: Transport = requestJson,
    private readonly lock: Lock = (action) => action(),
  ) {}
  getSnapshot = () => this.state;
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
  private apply(session: Session) {
    if (this.state.account?.id !== session.account?.id && this.state.account) {
      this.generation++;
      this.clearUserCache();
    }
    this.set({
      status: session.authenticated ? "authenticated" : "anonymous",
      account: session.account,
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
      const generation = this.generation;
      this.restoring = this.lock(async () => {
        if (generation !== this.generation) return;
        try {
          const session = await this.transport<Session>(
            "/api/v1/auth/session/restore",
            { method: "POST" },
          );
          if (generation === this.generation) this.apply(session);
        } catch (error) {
          if (generation === this.generation)
            this.set({ status: "unavailable", account: this.state.account });
          throw error;
        }
      }).finally(() => {
        this.restoring = undefined;
      });
    }
    return this.restoring;
  };
  private refresh() {
    if (!this.refreshing) {
      const generation = this.generation;
      this.refreshing = this.lock(async () => {
        if (generation !== this.generation || this.ending)
          throw new ApiError("세션이 종료되었습니다.", 401, "SESSION_INVALID");
        // Another tab may have refreshed while this tab waited for the Web Lock.
        try {
          await this.transport<Account>("/api/v1/auth/me");
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== "ACCESS_EXPIRED")
            throw error;
          await this.transport<Session>("/api/v1/auth/refresh", {
            method: "POST",
          });
        }
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
  ): Promise<T> {
    const generation = this.generation;
    const revision = this.revision;
    if (this.ending)
      throw new ApiError("로그아웃 처리 중입니다.", 401, "SESSION_INVALID");
    try {
      let result: T;
      try {
        result = await this.transport<T>(path, options);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "ACCESS_EXPIRED")
          throw error;
        if (revision === this.revision) await this.refresh();
        if (generation !== this.generation || this.ending)
          throw new ApiError("세션이 종료되었습니다.", 401, "SESSION_INVALID");
        result = await this.transport<T>(path, options); // One retry only.
      }
      if (generation !== this.generation)
        throw new ApiError("세션이 변경되었습니다.", 401, "SESSION_INVALID");
      return result;
    } catch (error) {
      if (
        generation === this.generation &&
        error instanceof ApiError &&
        error.code === "SESSION_INVALID"
      )
        this.invalid();
      throw error;
    }
  }
  async login(kind: "signup" | "login", email: string, password: string) {
    const generation = ++this.generation;
    const session = await this.lock(() =>
      this.transport<Session>(`/api/v1/auth/${kind}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    );
    if (generation !== this.generation) return;
    this.ending = false;
    this.clearUserCache();
    this.apply(session);
  }
  async logout() {
    this.ending = true;
    ++this.generation;
    this.clearUserCache();
    this.set({ status: "logging-out", account: null });
    try {
      // Wait for cookie-setting work, then revoke the resulting session and clear cookies.
      await Promise.allSettled([this.restoring, this.refreshing]);
      await this.lock(() =>
        this.transport<void>("/api/v1/auth/logout", { method: "POST" }),
      );
      this.set({ status: "anonymous", account: null });
      this.ending = false;
    } catch (error) {
      // Keep ending=true: a failed logout must not silently restore authentication.
      this.set({ status: "unavailable", account: null });
      throw error;
    }
  }
}
