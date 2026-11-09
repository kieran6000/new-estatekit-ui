import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Checkbox, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { listAgentProfiles } from "../api/_client";
import { addClientNote, CheckinsNotSetUp, createCheckin, deleteClientNote, listCheckins, listClientNotes, markCheckinShared, setNoteDone, type CheckinRow, type ClientNote } from "../api/checkins";
import { useAuth } from "../hooks/useAuth";
import { useSnack } from "../hooks/useSnack";
import { checkinMessage, nextStep, QUESTIONS, RISK_WORDS, scoreCheckin, type Risk } from "../lib/checkin";
import { waDigits } from "../lib/phone";
import { timeAgo } from "../lib/timeAgo";
import { tokens } from "../theme";

// The client's Check-ins tab: how happy they are, the weekly check-in to send,
// and what the team has to do for them. One glance answers "how are they, and
// is it time to check in?".

const RISK_COLOR: Record<Risk, string> = { green: tokens.green, amber: tokens.amber, red: tokens.red };
const RISK_TINT: Record<Risk, string> = { green: tokens.greenTint, amber: tokens.amberTint, red: tokens.redTint };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
const scoreColor = (n: number) => (n <= 2 ? tokens.red : n === 3 ? tokens.amber : tokens.green);
const linkFor = (c: CheckinRow) => `${window.location.origin}/k/${c.token}`;

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, minHeight: 40, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{sub}</Typography>}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Box>
  );
}

function RiskPill({ risk, big }: { risk: Risk; big?: boolean }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, px: big ? 1.25 : 0.875, py: big ? 0.5 : 0.25, borderRadius: "999px", bgcolor: RISK_TINT[risk], color: "text.primary", fontSize: big ? 15 : 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
      <Box component="span" sx={{ width: big ? 10 : 8, height: big ? 10 : 8, borderRadius: "50%", bgcolor: RISK_COLOR[risk] }} />
      {RISK_WORDS[risk]}
    </Box>
  );
}

/** One 1–5 answer as five boxes, so a 2 looks like a 2 from across the room. */
function Score({ n }: { n: number }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: "3px" }} aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Box key={i} sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: i <= n ? scoreColor(n) : tokens.surface2 }} />)}
      <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, ml: 0.75, fontVariantNumeric: "tabular-nums" }}>{n}</Typography>
    </Box>
  );
}

function SendBox({ agentId, clientName, clientPhone, rows, fromName }: { agentId: string; clientName: string; clientPhone: string | null; rows: CheckinRow[]; fromName: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  const step = nextStep(rows);
  const first = clientName.trim().split(/\s+/)[0] ?? "";
  const phone = waDigits(clientPhone);
  const waiting = step.kind === "waiting" ? rows.find((r) => !r.answered_at) ?? null : null;

  async function linkToSend(): Promise<CheckinRow> {
    if (waiting) return waiting;
    const c = await createCheckin(agentId, fromName);
    await qc.invalidateQueries({ queryKey: ["checkins", agentId] });
    return c;
  }
  async function viaWhatsApp() {
    setBusy(true);
    // Opened straight away (a phone blocks a window opened after waiting), then pointed at the link.
    const win = phone ? window.open("about:blank", "_blank") : null;
    try {
      const c = await linkToSend();
      const text = checkinMessage(first, fromName, linkFor(c));
      if (win) win.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      await markCheckinShared(c.id);
      await qc.invalidateQueries({ queryKey: ["checkins", agentId] });
    } catch (e) {
      win?.close();
      showSnack((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    setBusy(true);
    try {
      const c = await linkToSend();
      await navigator.clipboard.writeText(checkinMessage(first, fromName, linkFor(c)));
      await markCheckinShared(c.id);
      await qc.invalidateQueries({ queryKey: ["checkins", agentId] });
      showSnack("Message copied. Paste it in their WhatsApp chat.");
    } catch (e) {
      showSnack(e instanceof Error && !/clipboard/i.test(e.message) ? e.message : "Couldn't copy it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const tone = step.kind === "send" ? "amber" : step.kind === "waiting" && step.remind ? "amber" : "plain";
  const headline =
    step.kind === "send"
      ? step.reason === "never" ? "No check-in sent yet. Send the first one." : `Time to check in: the last one was ${step.days} days ago.`
      : step.kind === "waiting"
        ? `Sent ${day(step.sentAt)}, not answered yet.${step.remind ? " Send them a reminder." : ""}`
        : `This week's check-in is done. The next one is due ${day(step.nextDue)}.`;
  const label = step.kind === "waiting" ? "Send reminder on WhatsApp" : step.kind === "done" ? "Send another anyway" : "Send check-in on WhatsApp";

  return (
    <Box sx={{ p: 1.5, borderRadius: "8px", bgcolor: tone === "amber" ? tokens.amberTint : tokens.surface2, borderLeft: tone === "amber" ? `4px solid ${tokens.amber}` : undefined }}>
      <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{headline}</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.25 }}>
        {phone && (
          <Button variant={step.kind === "done" ? "outlined" : "contained"} disableElevation startIcon={<WhatsAppIcon />} onClick={viaWhatsApp} disabled={busy} sx={{ minHeight: 44 }}>
            {label}
          </Button>
        )}
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copy} disabled={busy} sx={{ minHeight: 44 }}>Copy message</Button>
        {waiting && (
          <Button component="a" href={linkFor(waiting)} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />} sx={{ minHeight: 44 }}>See what they see</Button>
        )}
      </Box>
      {!phone && <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 1 }}>They have no WhatsApp number on file, so copy the message and send it yourself.</Typography>}
    </Box>
  );
}

function HowTheyFeel({ agentId, clientName, clientPhone, fromName }: { agentId: string; clientName: string; clientPhone: string | null; fromName: string }) {
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ["checkins", agentId], queryFn: () => listCheckins(agentId), retry: (n, e) => !(e instanceof CheckinsNotSetUp) && n < 1 });
  const answered = rows.filter((r) => r.answered_at && r.answers);
  const latest = answered[0];
  const s = latest ? scoreCheckin(latest.answers!) : null;
  const trend = answered.slice(0, 8).reverse();

  if (error) return <Card title="How they're feeling"><Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{error instanceof CheckinsNotSetUp ? "Check-ins aren't switched on yet." : "Couldn't load their check-ins. Refresh to try again."}</Typography></Card>;
  return (
    <Card title="How they're feeling" sub={latest ? `Last answered ${timeAgo(latest.answered_at!)}` : undefined}>
      {isLoading ? null : (
        <>
          {latest && s ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 2, rowGap: 1, mb: 1.75 }}>
              <RiskPill risk={s.risk} big />
              <Typography sx={{ fontSize: 15 }}><b>{s.average}</b> of 5 on {day(latest.answered_at!)}</Typography>
              {trend.length > 1 && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, ml: { sm: "auto" } }}>
                  <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>Recent weeks</Typography>
                  {trend.map((r) => {
                    const t = scoreCheckin(r.answers!);
                    return <Tooltip key={r.id} title={`${day(r.answered_at!)}: ${t.average} of 5, ${RISK_WORDS[t.risk]}`}><Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: RISK_COLOR[t.risk] }} /></Tooltip>;
                  })}
                </Box>
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 14, color: tokens.ink2, mb: 1.5 }}>No answers yet. Once they fill in a check-in, how they're feeling shows here.</Typography>
          )}

          <SendBox agentId={agentId} clientName={clientName} clientPhone={clientPhone} rows={rows} fromName={fromName} />

          {latest && s && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, columnGap: 3, rowGap: 1 }}>
                {QUESTIONS.map((q) => (
                  <Box key={q.key} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, py: 0.5, borderBottom: `1px solid ${tokens.divider2}` }}>
                    <Typography sx={{ fontSize: 14, fontWeight: s.weak.includes(q.key) ? 600 : 400 }}>{q.short}</Typography>
                    <Score n={latest.answers![q.key]} />
                  </Box>
                ))}
              </Box>
              {latest.comment && (
                <Box sx={{ mt: 1.5, p: 1.25, borderRadius: "6px", bgcolor: tokens.surface2, borderLeft: `3px solid ${tokens.ink3}` }}>
                  <Typography sx={{ fontSize: 12.5, color: tokens.ink2, mb: 0.25 }}>What they said</Typography>
                  <Typography sx={{ fontSize: 15, whiteSpace: "pre-wrap" }}>{latest.comment}</Typography>
                </Box>
              )}
            </Box>
          )}

          {answered.length > 1 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mb: 0.75 }}>Earlier check-ins</Typography>
              {answered.slice(1).map((r) => {
                const t = scoreCheckin(r.answers!);
                return (
                  <Box key={r.id} sx={{ py: 1, borderTop: `1px solid ${tokens.divider2}` }}>
                    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1.5, rowGap: 0.5 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600, minWidth: 110 }}>{day(r.answered_at!)}</Typography>
                      <RiskPill risk={t.risk} />
                      <Typography sx={{ fontSize: 13.5 }}>{t.average} of 5</Typography>
                      <Typography sx={{ fontSize: 13, color: tokens.ink2 }}>{QUESTIONS.map((q) => `${q.short} ${r.answers![q.key]}`).join(" · ")}</Typography>
                    </Box>
                    {r.comment && <Typography sx={{ fontSize: 13.5, color: tokens.ink2, mt: 0.25, whiteSpace: "pre-wrap" }}>"{r.comment}"</Typography>}
                  </Box>
                );
              })}
            </Box>
          )}
        </>
      )}
    </Card>
  );
}

function NoteRow({ n, agentId, byName }: { n: ClientNote; agentId: string; byName: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const run = async (work: Promise<void>) => {
    try { await work; await qc.invalidateQueries({ queryKey: ["clientNotes", agentId] }); } catch (e) { showSnack((e as Error).message); }
  };
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 0.75, borderTop: `1px solid ${tokens.divider2}`, "&:hover .ek-del": { opacity: 1 } }}>
      {n.kind === "todo" ? (
        <Checkbox checked={!!n.done_at} onChange={(e) => run(setNoteDone(n.id, e.target.checked, byName))} slotProps={{ input: { "aria-label": `Done: ${n.body}` } }} sx={{ p: 0.5, mt: "-2px" }} />
      ) : <Box sx={{ width: 30, flex: "none" }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14.5, whiteSpace: "pre-wrap", textDecoration: n.done_at ? "line-through" : "none", color: n.done_at ? tokens.ink3 : "text.primary" }}>{n.body}</Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink3 }}>
          {day(n.created_at)}{n.created_by_name ? ` · ${n.created_by_name}` : ""}{n.done_at ? ` · done ${day(n.done_at)}${n.done_by_name ? ` by ${n.done_by_name}` : ""}` : ""}
          {n.link && <> · <Box component="a" href={n.link} target="_blank" rel="noopener" sx={{ color: "primary.main" }}>Open link</Box></>}
        </Typography>
      </Box>
      <Tooltip title="Remove">
        <IconButton className="ek-del" size="small" aria-label="Remove" onClick={() => { if (window.confirm("Remove this for good?")) void run(deleteClientNote(n.id)); }} sx={{ opacity: { xs: 1, md: 0 } }}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function ToDos({ agentId, byName }: { agentId: string; byName: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: notes = [], error } = useQuery({ queryKey: ["clientNotes", agentId], queryFn: () => listClientNotes(agentId), retry: (n, e) => !(e instanceof CheckinsNotSetUp) && n < 1 });
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const open = notes.filter((n) => n.kind === "todo" && !n.done_at);
  const done = notes.filter((n) => n.kind === "todo" && n.done_at);
  const plain = notes.filter((n) => n.kind === "note");
  const linkOk = !link.trim() || /^https:\/\/\S+$/.test(link.trim());

  async function add(kind: "todo" | "note") {
    if (!text.trim() || !linkOk) return;
    setSaving(true);
    try {
      await addClientNote(agentId, kind, text, link.trim() || null, byName);
      setText("");
      setLink("");
      await qc.invalidateQueries({ queryKey: ["clientNotes", agentId] });
    } catch (e) {
      showSnack((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error) return null;
  return (
    <Card title="To-dos and notes" sub={open.length ? `${open.length} to do` : undefined}>
      <TextField value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Move Monument Park to Erasmuskloof, or a call summary" multiline minRows={2} fullWidth size="small" />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1, alignItems: "center" }}>
        <TextField value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (optional), e.g. the call recording" size="small" error={!linkOk} helperText={linkOk ? undefined : "Paste the full link, starting with https://"} sx={{ flex: "1 1 240px" }} />
        <Button variant="contained" disableElevation disabled={!text.trim() || !linkOk || saving} onClick={() => add("todo")} sx={{ minHeight: 40 }}>Add to-do</Button>
        <Button variant="outlined" disabled={!text.trim() || !linkOk || saving} onClick={() => add("note")} sx={{ minHeight: 40 }}>Add note</Button>
      </Box>

      <Box sx={{ mt: 1.75 }}>
        {open.length === 0 && plain.length === 0 && done.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>Nothing yet. Add what needs doing for them, or notes from a call.</Typography>}
        {open.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} />)}
        {done.length > 0 && (
          <Button size="small" onClick={() => setShowDone((v) => !v)} sx={{ mt: 0.5 }}>{showDone ? "Hide done" : `Show ${done.length} done`}</Button>
        )}
        {showDone && done.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} />)}
        {plain.length > 0 && (
          <>
            <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mt: 2, mb: 0.5 }}>Notes</Typography>
            {plain.map((n) => <NoteRow key={n.id} n={n} agentId={agentId} byName={byName} />)}
          </>
        )}
      </Box>
    </Card>
  );
}

export default function CheckInsTab({ agentId, clientName, clientPhone }: { agentId: string; clientName: string; clientPhone: string | null }) {
  const { user } = useAuth();
  const { data: profiles } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles, staleTime: 5 * 60_000 });
  const me = profiles?.find((p) => p.agent_id === user?.id)?.display_name?.trim().split(/\s+/)[0] ?? "";
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(0, 2fr)" }, gap: 2, alignItems: "start" }}>
      <HowTheyFeel agentId={agentId} clientName={clientName} clientPhone={clientPhone} fromName={me} />
      <ToDos agentId={agentId} byName={me} />
    </Box>
  );
}

/** Next to the client's name: how they felt last time, or that a check-in is due.
 *  Opens the Check-ins tab. Nothing until check-ins are switched on. */
export function CheckinChip({ agentId, to }: { agentId: string; to: string }) {
  const { data: rows } = useQuery({ queryKey: ["checkins", agentId], queryFn: () => listCheckins(agentId), retry: false });
  if (!rows) return null;
  const latest = rows.find((r) => r.answered_at && r.answers);
  const step = nextStep(rows);
  const due = step.kind === "send";
  const s = latest ? scoreCheckin(latest.answers!) : null;
  return (
    <Box component={RouterLink} to={to} sx={{ display: "inline-flex", alignItems: "center", gap: 1, textDecoration: "none", color: "inherit" }}>
      {s && <RiskPill risk={s.risk} />}
      {s && <Typography component="span" sx={{ fontSize: 12.5, color: tokens.ink2 }}>{s.average} of 5</Typography>}
      {due && <Box component="span" sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.amber }}>{latest ? "Check-in due" : "No check-in yet"}</Box>}
    </Box>
  );
}
