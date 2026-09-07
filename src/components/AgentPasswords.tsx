import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box, Button, IconButton, InputAdornment, TextField, Typography,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LockResetIcon from "@mui/icons-material/LockReset";
import { tokens } from "../theme";
import { listAgentProfiles } from "../api/_client";
import { setAgentPassword } from "../api/agentProfile";

/** Operator-only agent logins panel.
 *
 *  Passwords are bcrypt-hashed in Supabase auth, so there is no way to display
 *  an existing password — only to set a new one. The phone number is the
 *  username, so it's shown here for handing over to the agent. */
export default function AgentPasswords({ onSnack }: { onSnack: (msg: string) => void }) {
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(agentId: string, name: string) {
    if (pw.trim().length < 8) {
      onSnack("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await setAgentPassword(agentId, pw.trim());
      onSnack(`New password set for ${name}`);
      setOpenFor(null);
      setPw("");
      setShow(false);
    } catch (e) {
      onSnack(e instanceof Error ? e.message : "Couldn't set password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Passwords are encrypted, so they can't be shown — you can set a new one and send it to the agent.
        Their phone number is their username.
      </Typography>

      {profiles.map((p) => (
        <Box key={p.agent_id} sx={{ borderTop: `1px solid ${tokens.divider}`, py: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 160 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{p.display_name || "—"}</Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{p.whatsapp_number || "no number"}</Typography>
            </Box>
            <Button
              size="small"
              variant={openFor === p.agent_id ? "contained" : "outlined"}
              startIcon={<LockResetIcon />}
              onClick={() => {
                setOpenFor(openFor === p.agent_id ? null : p.agent_id);
                setPw("");
                setShow(false);
              }}
              sx={{ textTransform: "none", whiteSpace: "nowrap" }}
            >
              {openFor === p.agent_id ? "Cancel" : "Set password"}
            </Button>
          </Box>

          {openFor === p.agent_id && (
            <Box sx={{ display: "flex", gap: 1, mt: 1.25, flexWrap: "wrap" }}>
              <TextField
                size="small"
                autoFocus
                type={show ? "text" : "password"}
                label="New password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                helperText="At least 8 characters"
                sx={{ flex: 1, minWidth: 200 }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShow((v) => !v)} aria-label="Show password">
                          {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Button
                variant="contained"
                disabled={busy || pw.trim().length < 8}
                onClick={() => save(p.agent_id, p.display_name || "agent")}
                sx={{ textTransform: "none", height: 40 }}
              >
                {busy ? "Saving…" : "Save"}
              </Button>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
