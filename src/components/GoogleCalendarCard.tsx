import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { disconnectGoogleCalendar, type GoogleCalendarStatus } from "../api/googleCalendar";
import { GCAL_EVENTS_KEY, GCAL_STATUS_KEY, useConnectGoogleCalendar, useGoogleCalendarStatus } from "../hooks/useGoogleCalendar";
import { useIsOperator } from "../hooks/useAutomations";
import { useSnack } from "../hooks/useSnack";
import { KIND_STYLE } from "../lib/calendar";
import { timeAgo } from "../lib/timeAgo";
import { tokens } from "../theme";
import GoogleCalendarIcon from "./GoogleCalendarIcon";

/** Account → Google Calendar: connect it once, and appointments, picked
 *  call times and follow-up reminders go in by themselves. Google keeps
 *  EstateKit signed in (a refresh token), so it stays connected until they
 *  disconnect here or remove EstateKit in their Google account. */
export default function GoogleCalendarCard({ returnTo = "/account", agentName }: { returnTo?: string; agentName?: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: isOperator } = useIsOperator();
  const { status, isLoading, managingOther } = useGoogleCalendarStatus();
  const { connect, busy } = useConnectGoogleCalendar(returnTo);

  if (isLoading) {
    return (
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent><Skeleton variant="text" width="40%" height={28} /><Skeleton variant="rounded" height={44} sx={{ mt: 1 }} /></CardContent>
      </Card>
    );
  }
  // Agents never see something they can't use yet; operators see why.
  if (!status || (!status.ready && !isOperator)) return null;

  /** True when it went. */
  async function disconnect(): Promise<boolean> {
    try {
      const { removed } = await disconnectGoogleCalendar();
      await Promise.all([
        qc.invalidateQueries({ queryKey: [GCAL_STATUS_KEY] }),
        qc.invalidateQueries({ queryKey: [GCAL_EVENTS_KEY] }),
        qc.invalidateQueries({ queryKey: ["myProfile"] }),
      ]);
      showSnack(removed ? `Google Calendar disconnected · ${removed} upcoming ${removed === 1 ? "entry" : "entries"} taken out` : "Google Calendar disconnected");
      return true;
    } catch (e) {
      console.error(e);
      showSnack("Couldn't disconnect. Try again.");
      return false;
    }
  }

  return (
    <GoogleCalendarCardView status={status} managingOther={managingOther} isOperator={!!isOperator} agentName={agentName}
      busy={busy} onConnect={connect} onDisconnect={disconnect} />
  );
}

/** What the card shows for a connection (no data fetching of its own). */
export function GoogleCalendarCardView({ status, managingOther, isOperator, agentName, busy, onConnect, onDisconnect }: {
  status: GoogleCalendarStatus;
  managingOther: boolean;
  isOperator: boolean;
  agentName?: string;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => Promise<boolean>;
}) {
  const connect = onConnect;
  const [confirmOff, setConfirmOff] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const broken = status.connected && status.needsReconnect;
  const ok = status.connected && !status.needsReconnect;
  const email = status.email && status.email.includes("@") ? status.email : null;
  const counts = ([
    ["appointment", status.upcoming.appointment, "appointment", "appointments"],
    ["call", status.upcoming.call, "call time", "call times"],
    ["followup", status.upcoming.followup, "follow-up", "follow-ups"],
  ] as const).filter(([, n]) => (n ?? 0) > 0);

  async function disconnect() {
    setDisconnecting(true);
    if (await onDisconnect()) setConfirmOff(false);
    setDisconnecting(false);
  }

  return (
    <Card variant="outlined" sx={{ mb: 3, borderColor: broken ? tokens.amberBorder : undefined }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <GoogleCalendarIcon size={24} />
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, flex: 1 }}>
            Google Calendar
          </Typography>
          {ok && <Chip size="small" variant="outlined" color="success" icon={<CheckIcon />} label="Connected" />}
          {broken && <Chip size="small" variant="outlined" color="warning" label="Needs reconnecting" />}
        </Box>

        {!status.ready ? (
          // Operators only (see above).
          <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
            Not switched on yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET go in the Supabase vault.
          </Typography>
        ) : managingOther ? (
          // A Google account belongs to a person: staff can see it, not connect it.
          <Typography sx={{ fontSize: 14.5 }}>
            {ok ? <>Connected to <b>{email ?? "their Google account"}</b>.</>
              : broken ? <>Disconnected by Google. {agentName || "The agent"} reconnects it from their own login.</>
              : <>Not connected. {agentName || "The agent"} connects it from their own login: it uses their Google account.</>}
          </Typography>
        ) : !status.connected ? (
          <Button variant="contained" size="large" fullWidth onClick={connect} disabled={busy}
            startIcon={busy ? <CircularProgress size={16} sx={{ color: "inherit" }} /> : <EventAvailableOutlinedIcon />}>
            Connect Google Calendar
          </Button>
        ) : broken ? (
          <>
            <Typography sx={{ fontSize: 14.5, color: tokens.amber }}>
              Google stopped letting EstateKit into {email ? <b>{email}</b> : "your calendar"}. Nothing new is going in.
            </Typography>
            <Button variant="contained" size="large" fullWidth onClick={connect} disabled={busy}
              startIcon={busy ? <CircularProgress size={16} sx={{ color: "inherit" }} /> : <EventAvailableOutlinedIcon />}>
              Reconnect Google Calendar
            </Button>
          </>
        ) : (
          <Typography sx={{ fontSize: 14.5 }}>
            Connected to <b>{email ?? "your Google account"}</b>.
          </Typography>
        )}

        {ok && (
          <>
            {counts.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, rowGap: 0.75 }} aria-label="Coming up in Google Calendar">
                {counts.map(([kind, n, one, many]) => (
                  <Box key={kind} sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 13.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: KIND_STYLE[kind].color, flex: "none" }} />
                    {n} {n === 1 ? one : many}
                  </Box>
                ))}
              </Box>
            )}
            <Typography sx={{ fontSize: 13, color: "text.secondary", display: "flex", alignItems: "center", gap: 0.75 }}>
              {status.pending > 0 ? (
                <><CircularProgress size={12} thickness={5} /> Updating…</>
              ) : status.lastSyncedAt ? (
                <>Up to date · last change {timeAgo(status.lastSyncedAt)}</>
              ) : (
                <>Up to date</>
              )}
            </Typography>
            {isOperator && status.lastError && (
              <Typography sx={{ fontSize: 13, color: tokens.amber }}>{status.lastError}</Typography>
            )}
          </>
        )}

        {status.connected && !managingOther && status.ready && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "space-between" }}>
            {ok ? (
              <Button component="a" href="https://calendar.google.com/calendar/r" target="_blank" rel="noopener noreferrer"
                variant="outlined" startIcon={<OpenInNewIcon />}>
                Open Google Calendar
              </Button>
            ) : <span />}
            <Button color="error" onClick={() => setConfirmOff(true)}>Disconnect</Button>
          </Box>
        )}
      </CardContent>

      <Dialog open={confirmOff} onClose={() => !disconnecting && setConfirmOff(false)}>
        <DialogTitle>Disconnect Google Calendar?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 15 }}>
            Upcoming EstateKit entries come out of {email ? <b>{email}</b> : "your calendar"}. Past ones stay.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOff(false)} disabled={disconnecting}>Keep it</Button>
          <Button variant="contained" color="error" onClick={disconnect} disabled={disconnecting}
            startIcon={disconnecting ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : undefined}>
            Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
