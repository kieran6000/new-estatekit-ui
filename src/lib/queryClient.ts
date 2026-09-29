import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime pushes changes in; this only limits re-fetching on tab focus.
      staleTime: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
