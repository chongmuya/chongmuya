"use client";

import { AuthProvider } from "@/features/auth/auth-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // Per mounted tree, never process-wide server request state.
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Suspense fallback={null}>{children}</Suspense>
      </AuthProvider>
    </QueryClientProvider>
  );
}
