import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "../components/ui/Toast/Toast.js";
import { TooltipProvider } from "../components/ui/Tooltip/Tooltip.js";
import { ApiError } from "../lib/api/errors.js";

/// One query client for the application (06 section 1): server state is
/// cached and refreshed here, nothing is persisted in the browser.
export function createQueryClient(
  options: { retry?: boolean } = {},
): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (options.retry === false) {
            return false;
          }

          // A 401, 403, 404 or validation error will not change on retry.
          if (
            error instanceof ApiError &&
            error.status > 0 &&
            error.status < 500
          ) {
            return false;
          }

          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function AppProviders({
  children,
  client,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  const [queryClient] = useState(() => client ?? createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
