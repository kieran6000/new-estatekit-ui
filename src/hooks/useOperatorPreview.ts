import { useIsOperator } from "./useAutomations";

/**
 * Ship a feature to the live site while only operators can see it.
 *
 *   const showNewThing = useOperatorPreview();
 *   {showNewThing && <NewThing />}
 *
 * Checks the person actually signed in, not the account they're viewing, so
 * an operator switched into an agent's account still sees it and the agent
 * never does. False while loading, so nothing flashes on for anyone else.
 * To release to everyone, delete the check.
 */
export function useOperatorPreview(): boolean {
  const { data } = useIsOperator();
  return data === true;
}
