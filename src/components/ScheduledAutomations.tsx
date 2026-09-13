import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, Chip, CircularProgress, Switch, Typography } from "@mui/material";
import { tokens } from "../theme";
import { getActiveAgentId, getActiveAgentIdSync } from "../api/_client";
import { getMyProfile } from "../api/agentProfile";
import {
  getAccountAutomationsPaused,
  listScheduledRuns,
  setAccountAutomationsPaused,
  updateScheduledRun,
  type ScheduledRun,
  type ScheduledRunPatch,
} from "../api/automations";
import { useAutomations, useAutomationSteps } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import type { AutomationStepRow } from "../types/automations";
import WhatsAppPreview from "./WhatsAppPreview";

// What's about to go out for the account you're viewing: every queued automation
// message, soonest first, with pause / send now / skip on each. Double-click a
// message to reword it for that lead.

// Mirrors run-automations: WhatsApps only send 08:00–20:00 SAST (UTC+2).
const SAST_OFFSET = 2;

function effectiveSendTime(runAtIso: string, quietHours: boolean): Date {
  const t = new Date(Math.max(Date.parse(runAtIso), Date.now()));
  if (!quietHours) return t;
  const hour = (t.getUTCHours() + SAST_OFFSET) % 24;
  if (hour >= 8 && hour < 20) return t;
  const next = new Date(t);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(8 - SAST_OFFSET);
  if (next <= t) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function relative(d: Date): string {
  const mins = Math.round((d.getTime() - Date.now()) / 60_000);
  if (mins <= 1) return "Sending now";
  if (mins < 60) return `In ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `In ${hrs}h`;
  return `In ${Math.round(hrs / 24)}d`;
}

const whenLabel = (d: Date) =>
  d.toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function describeStep(step: AutomationStepRow | undefined): string {
  if (!step) return "Finishes this automation";
  if (step.action_type === "set_reminder") return `Sets reminder: ${String(step.payload?.label ?? "follow up")}`;
  if (step.action_type === "set_stage") return `Moves lead to ${String(step.payload?.stage ?? "a new stage")}`;
  return "";
}

export default function ScheduledAutomations() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const agentKey = getActiveAgentIdSync() ?? "me";
  const runsKey = ["scheduledRuns", agentKey];
  const pausedKey = ["automationsPaused", agentKey];

  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, staleTime: 5 * 60_000 });
  const { data: automations = [] } = useAutomations();
  const { data: steps = [] } = useAutomationSteps();
  const { data: runs = [], isLoading } = useQuery({
    queryKey: runsKey,
    queryFn: async () => listScheduledRuns(await getActiveAgentId()),
    refetchInterval: 30_000,
  });
  const { data: accountPaused = false } = useQuery({
    queryKey: pausedKey,
    queryFn: async () => getAccountAutomationsPaused(await getActiveAgentId()),
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingAccount, setTogglingAccount] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: runsKey });

  async function act(run: ScheduledRun, patch: ScheduledRunPatch, message: string, undo?: ScheduledRunPatch) {
    setBusyId(run.id);
    try {
      await updateScheduledRun(run.id, patch);
      await refresh();
      showSnack(message, undo ? () => { void updateScheduledRun(run.id, undo).then(refresh); } : undefined);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't update that message. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAccount(paused: boolean) {
    setTogglingAccount(true);
    try {
      await setAccountAutomationsPaused(await getActiveAgentId(), paused);
      await Promise.all([qc.invalidateQueries({ queryKey: pausedKey }), refresh()]);
      showSnack(paused ? "Automations paused for this account" : "Automations back on for this account");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't change that. Try again.");
    } finally {
      setTogglingAccount(false);
    }
  }

  return (
    <Box sx={{ pb: 4 }}>
      {/* Account-wide switch */}
      <Box
        sx={{
          m: "12px 16px 0", p: "10px 8px 10px 16px", display: "flex", alignItems: "center", gap: 1,
          border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 500 }}>{profile?.displayName || "This account"}</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {accountPaused
              ? "Automations paused — nothing will send"
              : `${runs.length} message${runs.length === 1 ? "" : "s"} scheduled`}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{accountPaused ? "Paused" : "On"}</Typography>
        <Switch checked={!accountPaused} disabled={togglingAccount} onChange={(e) => toggleAccount(!e.target.checked)} />
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      ) : runs.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary", p: "24px 16px", textAlign: "center" }}>
          Nothing scheduled for this account.
        </Typography>
      ) : (
        runs.map((run) => {
          const automation = automations.find((a) => a.id === run.automation_id);
          const step = steps.find((s) => s.automation_id === run.automation_id && s.step_order === run.current_step);
          const isWhatsApp = step?.action_type === "send_whatsapp";
          const defaultText = step?.template_text ?? "";
          const text = run.template_override ?? defaultText;
          const sendAt = effectiveSendTime(run.run_at, isWhatsApp);
          const heldByQuietHours = isWhatsApp && sendAt.getTime() > Math.max(Date.parse(run.run_at), Date.now()) + 60_000;
          const busy = busyId === run.id;
          const locked = run.status === "processing";

          return (
            <Box
              key={run.id}
              sx={{ m: "12px 16px 0", border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper" }}
            >
              <Box sx={{ p: "12px 16px 10px" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography
                    component="button"
                    onClick={() => navigate(`/leads/${run.lead.id}`)}
                    sx={{
                      p: 0, border: 0, bgcolor: "transparent", cursor: "pointer", font: "inherit",
                      fontSize: 15, fontWeight: 500, color: tokens.primary, textAlign: "left",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    {run.lead.name}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", flex: 1, minWidth: 120 }}>
                    {automation?.name ?? "Automation"}
                  </Typography>
                  {run.status === "paused" ? (
                    <Chip size="small" label="Paused" variant="outlined" />
                  ) : locked ? (
                    <Chip size="small" label="Sending…" variant="outlined" color="primary" />
                  ) : (
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: tokens.primary }}>{relative(sendAt)}</Typography>
                  )}
                </Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
                  {whenLabel(sendAt)}
                  {heldByQuietHours ? " · waiting for 08:00 (quiet hours)" : ""}
                </Typography>
              </Box>

              <Box sx={{ px: 2 }}>
                {isWhatsApp ? (
                  <>
                    <WhatsAppPreview
                      lead={run.lead}
                      text={text}
                      time={sendAt}
                      editable={!locked}
                      onSave={(next) =>
                        act(
                          run,
                          { template_override: next.trim() === defaultText.trim() ? null : next },
                          "Message saved",
                          { template_override: run.template_override },
                        )
                      }
                    />
                    {run.template_override !== null && (
                      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                        Edited for this lead ·{" "}
                        <Box
                          component="button"
                          onClick={() => act(run, { template_override: null }, "Back to the usual message", { template_override: run.template_override })}
                          sx={{ p: 0, border: 0, bgcolor: "transparent", cursor: "pointer", font: "inherit", color: tokens.primary }}
                        >
                          use the usual message
                        </Box>
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{describeStep(step)}</Typography>
                )}
              </Box>

              <Box sx={{ display: "flex", flexWrap: "wrap", p: "4px 8px 6px" }}>
                {run.status === "paused" ? (
                  <Button size="small" disabled={busy || accountPaused} onClick={() => act(run, { status: "pending" }, "Resumed")}>
                    Resume
                  </Button>
                ) : (
                  <Button size="small" disabled={busy || locked} onClick={() => act(run, { status: "paused" }, "Paused", { status: "pending" })}>
                    Pause
                  </Button>
                )}
                <Button
                  size="small"
                  disabled={busy || locked || accountPaused}
                  onClick={() => {
                    const later = isWhatsApp && effectiveSendTime(new Date().toISOString(), true).getTime() > Date.now() + 60_000;
                    act(
                      run,
                      { status: "pending", run_at: new Date().toISOString() },
                      later ? "Queued — sends at 08:00 when quiet hours end" : "Sending within a minute",
                    );
                  }}
                >
                  Send now
                </Button>
                <Button
                  size="small"
                  color="error"
                  disabled={busy || locked}
                  onClick={() => act(run, { status: "cancelled" }, "Skipped", { status: run.status === "paused" ? "paused" : "pending" })}
                >
                  Skip
                </Button>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
