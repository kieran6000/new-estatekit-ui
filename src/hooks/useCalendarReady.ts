import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/_client";

/** Whether Google Calendar can be connected yet (its Google keys are set). */
export function useCalendarReady(): boolean {
  const { data } = useQuery({
    queryKey: ["googleCalendarReady"],
    queryFn: async () => {
      const { data } = await supabase.rpc("google_calendar_ready");
      return data === true;
    },
    staleTime: 10 * 60_000,
  });
  return data === true;
}
