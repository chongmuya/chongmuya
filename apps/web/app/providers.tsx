"use client";

import { NotificationObserver } from "@/features/notifications/client";
import { AuthProvider } from "@/features/auth/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // Per mounted tree, never process-wide server request state.
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationObserver />
        <Suspense fallback={null}>{children}</Suspense>
      </AuthProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
