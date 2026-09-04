import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Snackbar, Button } from "@mui/material";

interface SnackState {
  msg: string;
  undo?: () => void;
}

const SnackContext = createContext<{
  showSnack: (msg: string, undo?: () => void) => void;
} | null>(null);

export function SnackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SnackState | null>(null);
  const [open, setOpen] = useState(false);

  const showSnack = useCallback((msg: string, undo?: () => void) => {
    setState({ msg, undo });
    setOpen(true);
  }, []);

  return (
    <SnackContext.Provider value={{ showSnack }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={4200}
        onClose={() => setOpen(false)}
        message={state?.msg}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ mb: { xs: "56px", md: 0 } }}
        action={
          state?.undo ? (
            <Button
              color="primary"
              size="small"
              sx={{ color: "#82b1ff" }}
              onClick={() => {
                state.undo?.();
                setOpen(false);
              }}
            >
              Undo
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
