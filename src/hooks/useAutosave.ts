import { useEffect, useRef } from "react";
import { useIsMutating, useMutation } from "@tanstack/react-query";

// Saving as you go on the form page (Forms): no Save buttons to forget.
// Everything that saves there uses this key, so one "Saving… / All changes
// saved" line covers the whole page.
export const FORM_SAVE_KEY = ["formSave"];

/** Saves `value` a moment after it stops changing (when it differs from
 *  `saved` and `ready` says it's valid), and straight away if the screen
 *  closes first. Give the component a `key` per form, so a half-typed change
 *  saves to the form it was typed on, never to the next one. */
export function useAutosave<T>(value: T, saved: T, save: (v: T) => Promise<void>, { ready = true, delay = 900 }: { ready?: boolean; delay?: number } = {}) {
  const m = useMutation({ mutationKey: FORM_SAVE_KEY, mutationFn: save, onError: (e) => console.error(e) });
  const key = JSON.stringify(value);
  const dirty = key !== JSON.stringify(saved);
  const latest = useRef({ value, dirty, ready, save });
  latest.current = { value, dirty, ready, save };
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!dirty || !ready) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      m.mutate(latest.current.value);
    }, delay);
    return () => window.clearTimeout(timer.current);
  }, [key, dirty, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving before the wait was up: save what's there now.
  useEffect(() => () => {
    const l = latest.current;
    if (timer.current !== undefined && l.dirty && l.ready) void l.save(l.value).catch((e) => console.error(e));
  }, []);

  return { saving: m.isPending, failed: m.isError };
}

/** Whether anything on the form page is saving right now. */
export function useFormSaving(): boolean {
  return useIsMutating({ mutationKey: FORM_SAVE_KEY }) > 0;
}
