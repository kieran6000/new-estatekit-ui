import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "../api/agentProfile";
import { useIsOperator } from "./useAutomations";

/** Who gets the admin tools here. Staff everywhere; a self-run account (one
 *  another agency runs, agent_profiles.builds_own_forms) for itself only:
 *  its ads, tracking and automations. The database enforces the "itself
 *  only"; this just decides what the screens show. */
export function useAdminAccess() {
  const { data: isOperator, isLoading: loadingOperator } = useIsOperator();
  const { data: profile, isLoading: loadingProfile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, staleTime: 5 * 60_000, enabled: isOperator === false });
  const selfRun = isOperator === false && profile?.buildsOwnForms === true;
  return {
    isOperator: isOperator === true,
    selfRun,
    canAdmin: isOperator === true || selfRun,
    loading: loadingOperator || (isOperator === false && loadingProfile),
  };
}
