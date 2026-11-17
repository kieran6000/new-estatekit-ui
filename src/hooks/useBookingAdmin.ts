import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { blockFunnelTime, listFunnelCalendar, unblockFunnelTime, type FunnelCalendar } from "../api/bookingAdmin";

export const FUNNEL_CAL_KEY = "funnelCalendar";

/** The funnel's bookings + blocked times between two moments. Operators only
 *  — pass enabled=false otherwise so it never calls. */
export function useFunnelCalendar(from: Date, to: Date, enabled: boolean) {
  return useQuery<FunnelCalendar>({
    queryKey: [FUNNEL_CAL_KEY, from.toISOString(), to.toISOString()],
    queryFn: () => listFunnelCalendar(from, to),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}

/** Block off a time, or lift a block. Both refresh the funnel calendar. */
export function useFunnelBlockActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: [FUNNEL_CAL_KEY] });
  const block = useMutation({
    mutationFn: (v: { startsAt: string; endsAt: string; note?: string }) => blockFunnelTime(v.startsAt, v.endsAt, v.note),
    onSuccess: invalidate,
  });
  const unblock = useMutation({
    mutationFn: (eventId: string) => unblockFunnelTime(eventId),
    onSuccess: invalidate,
  });
  return { block, unblock };
}
