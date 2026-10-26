import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/_client";
import { useAuth } from "./useAuth";

/** Whether the signed-in user leads a team (e.g. Bennie leads Naudé): they get
 *  the account switcher, listing themselves and their members. */
export function useIsTeamLead(): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["isTeamLead", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("agent_profiles")
        .select("agent_id", { count: "exact", head: true })
        .eq("team_lead_id", user!.id);
      return (count ?? 0) > 0;
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
  });
  return data === true;
}
