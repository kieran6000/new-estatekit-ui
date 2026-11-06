import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Snackbar, Button } from "@mui/material";

interface SnackState {
  msg: string;
  undo?: () => void;
  actionLabel?: string;
  /** A second line added later (addSnackNote), e.g. what Google Calendar did. */
  note?: string;
}

const SnackContext = createContext<{
  showSnack: (msg: string, undo?: () => void, actionLabel?: string) => void;
  addNote: (note: string) => void;
} | null>(null);

export function SnackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SnackState | null>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  const showSnack = useCallback((msg: string, undo?: () => void, actionLabel?: string) => {
    setState({ msg, undo, actionLabel });
    setOpen(true);
    openRef.current = true;
  }, []);

  // A line that belongs with the snack already showing ("Moved to Contacted"
  // + "In your Google Calendar: Thu 6 Nov, 17:45"): added under it, so its
  // Undo stays. If nothing is showing any more, it shows on its own.
  const addNote = useCallback((note: string) => {
    if (openRef.current) setState((s) => (s ? { ...s, note } : { msg: note }));
    else showSnack(note);
  }, [showSnack]);

  const close = () => { setOpen(false); openRef.current = false; };

  return (
    <SnackContext.Provider value={{ showSnack, addNote }}>
      {children}
      <Snackbar
        open={open}
        // A second line gets a little longer (and restarts the timer: MUI
        // restarts it when the duration changes).
        autoHideDuration={state?.note ? 6500 : 4200}
        onClose={close}
        message={state?.note ? <>{state.msg}<br />{state.note}</> : state?.msg}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: "var(--ek-nav-h)" }}
        action={
          state?.undo ? (
            <Button
              color="primary"
              size="small"
              // Snackbars are inverted (dark on light pages, light on dark), so
              // the action colour flips with them.
              sx={{ color: "var(--ek-snackAction)" }}
              onClick={() => {
                state.undo?.();
                close();
              }}
            >
              {state.actionLabel ?? "Undo"}
            </Button>
          ) : undefined
        }
      />
    </SnackContext.Provider>
  );
}

export function useSnack() {
  const ctx = useContext(SnackContext);
  if (!ctx) throw new Error("useSnack must be used inside SnackProvider");
  return ctx.showSnack;
}

/** Adds a line under the snack that's showing (or shows it alone). */
export function useSnackNote() {
  const ctx = useContext(SnackContext);
  if (!ctx) throw new Error("useSnackNote must be used inside SnackProvider");
  return ctx.addNote;
}
