import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import PauseCircleOutlinedIcon from "@mui/icons-material/PauseCircleOutlined";
import { tokens } from "../theme";
import { useSnack } from "../hooks/useSnack";
import { DEACTIVATE_REASONS, setAccountStatus, type ClientProfile } from "../api/clients";

// Deactivate / reactivate a client (client page). What it does is the
// account-status edge function's job; this is just the switch and the words.

type P = Pick<ClientProfile, "agent_id" | "display_name" | "deactivated_at" | "deactivated_reason" | "deactivated_by_name">;

function useStatusChange(p: P) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  const run = async (action: "deactivate" | "reactivate", reason?: string) => {
    setBusy(true);
    try {
      await setAccountStatus(p.agent_id, action, reason);
      await Promise.all(["client", "clients", "agentProfiles", "reportAgents"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      showSnack(action === "deactivate" ? `${p.display_name || "Account"} deactivated` : `${p.display_name || "Account"} is active again`);
      return true;
    } catch (e) {
      showSnack(e instanceof Error ? e.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

/** Across the top of a deactivated client's page. */
export function DeactivatedBanner({ profile: p }: { profile: P }) {
  const { run, busy } = useStatusChange(p);
  const [confirm, setConfirm] = useState(false);
  if (!p.deactivated_at) return null;
  return (
    <Box sx={{ bgcolor: tokens.amberTint, borderBottom: `1px solid ${tokens.amberBorder}` }}>
      <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: 2, md: 3 }, py: 1.25, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <PauseCircleOutlinedIcon sx={{ color: tokens.amber }} />
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>
            Deactivated{p.deactivated_reason ? `: ${p.deactivated_reason}` : ""}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Since {when(p.deactivated_at)}{p.deactivated_by_name ? ` by ${p.deactivated_by_name}` : ""}. They can't sign in and their automations are off. Leads from their pages are still saved.
          </Typography>
        </Box>
        <Button variant="contained" disabled={busy} onClick={() => setConfirm(true)}>Reactivate</Button>
      </Box>
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Reactivate {p.display_name || "this account"}?</DialogTitle>
        <DialogContent>
          <Typography>They can sign in again straight away, and their automations go back to how they were.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="contained" disabled={busy} onClick={async () => { if (await run("reactivate")) setConfirm(false); }}>Reactivate</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** Settings tab: the deactivate switch (or reactivate, when deactivated). */
export function AccountStatusSection({ profile: p }: { profile: P }) {
  const { run, busy } = useStatusChange(p);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(DEACTIVATE_REASONS[0]);
  const name = p.display_name || "this account";

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${p.deactivated_at ? tokens.amberBorder : tokens.redBorder}`, borderRadius: "8px", p: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Typography sx={{ fontWeight: 600 }}>{p.deactivated_at ? "Account deactivated" : "Deactivate account"}</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          {p.deactivated_at
            ? "Reactivate to let them sign in again and switch their automations back on."
            : "For clients who stopped paying or left. Blocks their sign-in, stops their automations, and moves them off your lists. Nothing is deleted."}
        </Typography>
      </Box>
      {p.deactivated_at ? (
        <Button variant="contained" disabled={busy} onClick={() => void run("reactivate")}>Reactivate</Button>
      ) : (
        <Button color="error" variant="outlined" startIcon={<PauseCircleOutlinedIcon />} onClick={() => setOpen(true)}>Deactivate</Button>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Deactivate {name}?</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 14, "& li": { mb: 0.5 } }}>
            <li>They can't sign in. If they're signed in now, they see "Your account is paused" with a button to message you.</li>
            <li>Their automations stop and queued WhatsApps are cancelled.</li>
            <li>They leave Accounts, the account switcher and Weekly reports (see Accounts → Deactivated).</li>
            <li>Their leads, pages and history stay. Reactivate any time.</li>
          </Box>
          <TextField select size="small" label="Why" value={reason} onChange={(e) => setReason(e.target.value)}>
            {DEACTIVATE_REASONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={async () => { if (await run("deactivate", reason)) setOpen(false); }}>
            {busy ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
