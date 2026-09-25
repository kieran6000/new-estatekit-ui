import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemIcon,
  MenuItem,
  Select,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ViewListIcon from "@mui/icons-material/ViewList";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PlaceIcon from "@mui/icons-material/Place";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useLeadWithStatus, useUpdateLeadNote, useUpdateLeadStage } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { getPipelinePublic } from "../api/pipelines";
import { useSnack } from "../hooks/useSnack";
import { MAIN_OUTCOME_OPTIONS, stepForStage, type MainOutcomeOption } from "../lib/stageLogic";
import { prettyAnswer } from "../lib/format";
import { timeAgo, whenLabel, isUpcoming } from "../lib/timeAgo";
import { trackActivity } from "../lib/activity";
import { armPendingCall, clearPendingCall } from "../lib/pendingCall";
import { getLeadByToken, logOutcomeByToken, saveNoteByToken } from "../api/leadActions";
import { logCallByToken, logLeadCall } from "../api/leadEvents";
import OutcomeSheet, { OUTCOME_ICONS, outcomeSnack } from "../components/OutcomeSheet";
import estateKitLogo from "../assets/blue logo full.png";
import type { LeadRow, OutcomeStep, PipelineKind, Stage } from "../types";

// Share tokens are 8 hex chars (links sent before 25 Sept 2026) or 32 (after).
// Lead ids are UUIDs with dashes, so they never match either. This must be
// live before the edge functions that mint 32-char tokens are deployed, or
// new WhatsApp links open as an unknown lead id.
function isTokenFormat(s: string): boolean {
  return /^[a-f0-9]{8}$|^[a-f0-9]{32}$/.test(s);
}

export default function LeadActionPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const { user } = useAuth();
  const isToken = leadId ? isTokenFormat(leadId) : false;
  const isAuthed = !!user;

  if (isToken) {
    return <TokenLeadActionPage token={leadId ?? ""} canEdit={isAuthed} />;
  }
  if (!isAuthed) {
    return <LeadActionUI lead={null} isLoading={false} canEdit={false} />;
  }
  return <AuthedLeadActionPage leadId={leadId ?? ""} />;
}

function TokenLeadActionPage({ token, canEdit }: { token: string; canEdit: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["leadByToken", token],
    queryFn: () => getLeadByToken(token),
    enabled: !!token,
  });

  const lead = data?.lead ?? null;

  // Even signed out, the token itself authorises logging this one lead's outcome.
  // pipelineKind comes back with the lead so buyer leads get buyer options even
  // when there's no session to load the pipeline list from.
  return (
    <LeadActionUI
      lead={lead}
      isLoading={isLoading}
      canEdit={canEdit}
      token={token}
      kindHint={data?.pipelineKind}
    />
  );
}

function AuthedLeadActionPage({ leadId }: { leadId: string }) {
  const { lead, isLoading } = useLeadWithStatus(leadId);
  return <LeadActionUI lead={lead ?? null} isLoading={isLoading} canEdit={true} />;
}

function LeadActionUI({
  lead,
  isLoading,
  canEdit,
  token,
  kindHint,
}: {
  lead: LeadRow | null;
  isLoading: boolean;
  canEdit: boolean;
  /** Share token, when opened from a WhatsApp action link. Lets a signed-out
   *  agent still log what happened. */
  token?: string;
  /** Pipeline kind resolved server-side, for when the pipeline list can't be
   *  loaded (signed-out token view). */
  kindHint?: PipelineKind;
}) {
  const { data: pipelines = [] } = usePipelines({ enabled: canEdit });
  const updateNote = useUpdateLeadNote();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();
  const qc = useQueryClient();
  // Signed-in agents get the full flow; a share token is enough to log an outcome.
  const canLog = canEdit || !!token;

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  // The follow-up sheet (when? / reminder / commission) — only for outcomes that
  // need a second answer. The outcome list itself is the "What happened?" dropdown.
  const [stageSheet, setStageSheet] = useState<{ step: OutcomeStep; stage: Stage } | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // What this session logged, and whether it's still in flight. This is the
  // whole point of the screen: the agent must never be left wondering whether
  // the tap worked. A snackbar alone isn't enough — it disappears.
  const [logged, setLogged] = useState<{ stage: Stage; label: string; status: "saving" | "saved" | "failed" } | null>(null);
  // Set while the "when is it?" step is on screen for a booked outcome.
  const [askWhen, setAskWhen] = useState<{ stage: Stage; label: string } | null>(null);

  // The page can't hear the call, but it can tell when they leave for the dialer
  // and come back. We arm a pending call on tap (so an un-logged call resurfaces
  // on the Leads page), and when they return from a real call we bring the
  // inline "How did it go?" card into view and flash it — no modal to dismiss.
  const awaitingReturn = useRef(false);
  const didHide = useRef(false);
  const tapTime = useRef(0);
  const RETURN_MIN_MS = 3000; // shorter than this = they backed out, no call happened

  function flashOutcome() {
    // Back from a real call → open the "What happened?" dropdown for them and
    // pulse it, so logging the outcome is the one obvious next tap.
    setHighlight(true);
    setOutcomeOpen(true);
    setTimeout(() => setHighlight(false), 2200);
  }

  function onCallTap() {
    if (!canLog || !lead) return;
    trackActivity("call_started", { lead: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage } });
    if (canEdit) logLeadCall(lead.id, lead.agent_id);
    else if (token) logCallByToken(token);
    armPendingCall({ leadId: lead.id, name: lead.name, phone: lead.phone, startedAt: Date.now() });
    awaitingReturn.current = true;
    didHide.current = false;
    tapTime.current = Date.now();
  }

  // Optimistically reflect a token lead's stage in the cache so the chip and
  // dropdown update the instant it's tapped — no waiting on the network.
  function setTokenStage(stage: Stage) {
    qc.setQueryData(["leadByToken", token], (old: { lead: LeadRow } | null | undefined) =>
      old?.lead ? { ...old, lead: { ...old.lead, stage } } : old,
    );
  }

  function logTokenOutcome(stage: Stage, offerUndo: boolean, label?: string, at?: string | null) {
    if (!token || !lead) return;
    const prevStage = lead.stage as Stage;
    if (stage === prevStage) return;
    setTokenStage(stage);            // instant
    setLogged({ stage, label: label ?? labelForStage(stage, pipelineKind), status: "saving" });
    clearPendingCall();
    logOutcomeByToken(token, stage, at)
      .then(() => {
        setLogged((l) => (l && l.stage === stage ? { ...l, status: "saved" } : l));
        // The server works out the follow-up (next_label / reminder_at) from the
        // stage, so pull the row back to show the agent what's actually been set.
        qc.invalidateQueries({ queryKey: ["leadByToken", token] });
        if (offerUndo) showSnack(outcomeSnack(stage), () => logTokenOutcome(prevStage, false));
        else showSnack(outcomeSnack(stage));
      })
      .catch(() => {
        setTokenStage(prevStage);    // roll back the optimistic change
        setLogged((l) => (l && l.stage === stage ? { ...l, status: "failed" } : l));
        showSnack("Couldn't save — try again", () => logTokenOutcome(stage, offerUndo, label, at), "Retry");
      });
  }

  function pickOutcome(opt: MainOutcomeOption) {
    if (!lead) return;
    // Signed out: the share token authorises the update. Follow-up questions
    // (when? / commission) are skipped — sensible defaults are applied server
    // side and can be refined later in the dashboard.
    if (!canEdit) {
      // An appointment with no time is the reason none of them could ever show
      // in a diary. Ask before writing rather than storing a bare "Appt set".
      if (opt.stage === "Booked" || opt.stage === "Viewing Booked") {
        setAskWhen({ stage: opt.stage, label: opt.label });
        return;
      }
      logTokenOutcome(opt.stage, true, opt.label);
      return;
    }
    const sub = stepForStage(opt.stage, pipelineKind);
    if (sub) {
      setStageSheet({ step: sub, stage: opt.stage });
      return;
    }
    // Signed in: useUpdateLeadStage is already optimistic with rollback.
    const prev = { stage: lead.stage, next_label: lead.next_label, due: lead.due, reminder_at: lead.reminder_at, commission: lead.commission };
    trackActivity("stage_change", {
      lead: { id: lead.id, name: lead.name, phone: lead.phone, fromStage: lead.stage, toStage: opt.stage, pipeline: pipelineKind },
    });
    setLogged({ stage: opt.stage, label: opt.label, status: "saving" });
    updateStage.mutate(
      { id: lead.id, stage: opt.stage },
      {
        onSuccess: () => setLogged((l) => (l && l.stage === opt.stage ? { ...l, status: "saved" } : l)),
        onError: () => setLogged((l) => (l && l.stage === opt.stage ? { ...l, status: "failed" } : l)),
      },
    );
    clearPendingCall();
    showSnack(outcomeSnack(opt.stage), () => updateStage.mutate({ id: lead.id, stage: prev.stage as Stage, override: prev }));
  }

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "hidden") {
        if (awaitingReturn.current) didHide.current = true;
        return;
      }
      if (!awaitingReturn.current || !didHide.current) return;
      const away = Date.now() - tapTime.current;
      awaitingReturn.current = false;
      if (away >= RETURN_MIN_MS) {
        flashOutcome(); // a real call happened → nudge them to the outcome card
      } else {
        clearPendingCall(); // backed out of the dialer immediately → no call
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => setNote(lead?.note ?? ""), [lead?.id]);
  // A different lead is a different job — don't carry the last one's "Logged"
  // banner across, or the agent sees a confirmation for work they haven't done.
  useEffect(() => setLogged(null), [lead?.id]);
  // Always open at the top — no mysterious mid-page scroll on load.
  useEffect(() => { window.scrollTo(0, 0); }, [lead?.id, isLoading]);

  function saveNote(value: string) {
    if (!lead || !canLog) return;
    setSaveState("Saving…");
    if (canEdit) {
      updateNote.mutate(
        { id: lead.id, note: value },
        { onSuccess: () => setSaveState("Saved"), onError: () => setSaveState("Save failed") },
      );
    } else if (token) {
      // Signed out: the share token authorises the note write.
      saveNoteByToken(token, value)
        .then(() => setSaveState("Saved"))
        .catch(() => setSaveState("Save failed"));
    }
  }

  function onNoteChange(value: string) {
    setNote(value);
    if (!canLog) return;
    setSaveState("Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNote(value), 600);
  }

  // Resolving the pipeline kind has to survive three cases, or the lead gets the
  // wrong "what happened?" list: the pipeline is in the loaded list; there's no
  // session to load one (token view); or the list is loaded but belongs to a
  // different agent than the lead (an operator opening a client's lead). Only
  // the last resort is a guess.
  const matchedKind = lead ? pipelines.find((p) => p.id === lead.pipeline_id)?.kind : undefined;
  const { data: leadPipeline } = useQuery({
    queryKey: ["pipelinePublic", lead?.pipeline_id],
    queryFn: () => getPipelinePublic(lead!.pipeline_id),
    enabled: !!lead?.pipeline_id && !matchedKind && !kindHint,
    staleTime: 60 * 60_000,
    retry: false,
  });
  const pipelineKind: PipelineKind = matchedKind ?? kindHint ?? leadPipeline?.kind ?? "seller";
  const digits = lead?.phone.replace(/\D/g, "") ?? "";
  // Surface the property address right under the phone; keep it out of the
  // generic "From their form" list so it isn't shown twice.
  const addressAnswer = lead?.form_answers.find((a) => /address/i.test(a.q)) ?? null;
  // Drop the address (shown above) and any blank answers — an unanswered
  // question rendered as an empty row just looks broken.
  const answeredQuestions = lead
    ? lead.form_answers.filter((a) => a !== addressAnswer && (a.a ?? "").trim() !== "")
    : [];

  const firstName = lead?.name.split(" ")[0] ?? "";

  return (
    // Sized to one screen on a normal phone; on very short screens the content
    // area scrolls rather than clipping.
    <Box sx={{ minHeight: "100dvh", maxHeight: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: tokens.bg }}>
      {/* Slim header: logo + a shortcut to the full leads list (also the sign-in
          funnel when opened from a WhatsApp link while logged out). */}
      <Box sx={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 1, p: "6px 6px 6px 14px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 20 }} />
        <Box sx={{ flex: 1 }} />
        <IconButton component="a" href="/leads" size="small" aria-label="All my leads" sx={{ color: tokens.primaryDark }}>
          <ViewListIcon />
        </IconButton>
      </Box>

      {isLoading ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
          <Box sx={{ width: "100%", maxWidth: 460 }}>
            <Skeleton variant="rounded" height={200} sx={{ borderRadius: "12px" }} />
          </Box>
        </Box>
      ) : !lead ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
          <Box sx={{ textAlign: "center", maxWidth: 320 }}>
            <LinkOffIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
            <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>Link not valid</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", lineHeight: 1.6 }}>
              This link has expired or isn't valid. Ask your agent for a new one.
            </Typography>
          </Box>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", width: "100%", maxWidth: 480, mx: "auto", p: "12px", display: "flex", flexDirection: "column", gap: 1.25 }}>
          {/* Who + everything they need to scan, in one compact card */}
          <Box sx={{ bgcolor: "background.paper", borderRadius: "12px", border: `1px solid ${tokens.divider}`, p: "12px 14px" }}>
            <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15, minWidth: 0, wordBreak: "break-word" }}>{lead.name}</Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>{timeAgo(lead.created_at)}</Typography>
            </Box>
            <Box sx={{ mt: 0.75, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
              <StageChip stage={lead.stage} />
            </Box>

            {/* What's already committed for this lead, stated up front. Without
                it an agent opening the link has no idea an appointment is an
                hour away — the single most useful thing to know before ringing. */}
            {isUpcoming(lead.reminder_at) && (
              <Box
                sx={{
                  display: "flex", alignItems: "center", gap: 1, mt: 1,
                  bgcolor: tokens.amberTint, border: "1px solid #f59e0b55",
                  borderRadius: "8px", p: "8px 10px",
                }}
              >
                <EventAvailableIcon sx={{ fontSize: 18, color: "#b45309", flex: "0 0 auto" }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "#92400e", lineHeight: 1.3 }}>
                    {lead.next_label && lead.next_label !== "—" ? lead.next_label : "Follow up"}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: "#92400e", lineHeight: 1.3 }}>
                    {whenLabel(lead.reminder_at)}
                  </Typography>
                </Box>
              </Box>
            )}

            <Divider sx={{ my: 1 }} />

            <InfoLine icon={<CallIcon fontSize="small" />} value={lead.phone} href={`tel:${digits}`} strong />
            {lead.email && <InfoLine icon={<EmailOutlinedIcon fontSize="small" />} value={lead.email} href={`mailto:${lead.email}`} />}
            {addressAnswer && <InfoLine icon={<PlaceIcon fontSize="small" />} value={addressAnswer.a} />}

            {answeredQuestions.length > 0 && (
              <Box sx={{ mt: 1, borderTop: `1px solid ${tokens.divider2}` }}>
                {answeredQuestions.map((r, i) => (
                  <Box key={i} sx={{ py: 0.9, borderTop: i ? `1px solid ${tokens.divider2}` : 0 }}>
                    <Typography sx={{ fontSize: 12.5, color: "text.secondary", lineHeight: 1.35 }}>{r.q}</Typography>
                    <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word", mt: 0.2 }}>{prettyAnswer(r.a)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* A numbered, labelled checklist so it reads as "do these in order",
              not three loose controls. */}
          <Step n={1} label="Call them">
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                component="a"
                href={`tel:${digits}`}
                onClick={onCallTap}
                variant="contained"
                fullWidth
                startIcon={<CallIcon />}
                sx={{ bgcolor: tokens.green, "&:hover": { bgcolor: tokens.greenDark }, py: 1.25, fontSize: 15.5, fontWeight: 700 }}
              >
                Call {firstName}
              </Button>
              <IconButton
                component="a"
                href={`https://wa.me/${digits}`}
                target="_blank"
                rel="noopener"
                aria-label="Message on WhatsApp"
                sx={{ color: "#25D366", border: `1px solid ${tokens.divider}`, borderRadius: "8px", width: 46, height: 46, flex: "0 0 auto" }}
              >
                <WhatsAppIcon />
              </IconButton>
            </Box>
          </Step>

          <Step n={2} label="Log what happened">
            {/* Once something is logged this visit, the dropdown is replaced by a
                plain statement of what was saved and what happens next. The
                agent should never have to guess whether the tap worked. */}
            {askWhen ? (
              <WhenIsItStep
                label={askWhen.stage === "Viewing Booked" ? "When is the viewing?" : "When is the appointment?"}
                onCancel={() => setAskWhen(null)}
                onPick={(iso) => {
                  const picked = askWhen;
                  setAskWhen(null);
                  logTokenOutcome(picked.stage, true, picked.label, iso);
                }}
              />
            ) : logged ? (
              <LoggedConfirmation
                label={logged.label}
                status={logged.status}
                nextLabel={lead.next_label}
                reminderAt={lead.reminder_at}
                onChange={() => { setLogged(null); setOutcomeOpen(true); }}
              />
            ) : (
            <FormControl
              fullWidth
              sx={{
                bgcolor: "background.paper", borderRadius: "6px",
                boxShadow: highlight ? `0 0 0 3px ${tokens.primaryBg}` : "none",
                transition: "box-shadow .3s ease",
              }}
            >
              <InputLabel id="outcome-label">What happened?</InputLabel>
              <Select<Stage | "">
                labelId="outcome-label"
                label="What happened?"
                value={
                  MAIN_OUTCOME_OPTIONS[pipelineKind].some((o) => o.stage === lead.stage)
                    ? (lead.stage as Stage)
                    : ""
                }
                displayEmpty
                open={outcomeOpen}
                onOpen={() => setOutcomeOpen(true)}
                onClose={() => setOutcomeOpen(false)}
                onChange={(e) => {
                  const opt = MAIN_OUTCOME_OPTIONS[pipelineKind].find((o) => o.stage === e.target.value);
                  if (opt) pickOutcome(opt);
                }}
              >
                {MAIN_OUTCOME_OPTIONS[pipelineKind].map((opt) => (
                  <MenuItem key={opt.label} value={opt.stage}>
                    <ListItemIcon sx={{ minWidth: 36, color: "text.secondary" }}>{OUTCOME_ICONS[opt.icon]}</ListItemIcon>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            )}
          </Step>

          {/* Notes are step 3, right where the flow ends. Available on the
              WhatsApp link too — saved via the share token when signed out. */}
          {canLog && (
            <Step n={3} label="Add a note" optional>
              <TextField
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                onBlur={() => saveNote(note)}
                placeholder="Anything worth remembering…"
                size="small"
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                helperText={saveState || " "}
                sx={{ "& .MuiFormHelperText-root": { m: "2px 4px", fontSize: 11 } }}
              />
            </Step>
          )}
        </Box>
      )}

      {/* Sticky footer — always one tap to the full list, never scrolled away. */}
      {!isLoading && lead && (
        <Box sx={{ flex: "0 0 auto", p: "10px 12px calc(10px + env(safe-area-inset-bottom))", bgcolor: "background.paper", borderTop: `1px solid ${tokens.divider}` }}>
          <Button
            component="a"
            href="/leads"
            variant="outlined"
            fullWidth
            startIcon={<ViewListIcon />}
            sx={{ textTransform: "none", fontWeight: 600, py: 1 }}
          >
            View all my leads
          </Button>
        </Box>
      )}

      {canEdit && lead && (
        <OutcomeSheet
          lead={lead}
          pipelineKind={pipelineKind}
          open={!!stageSheet}
          entryStep={stageSheet?.step ?? "main"}
          entryStage={stageSheet?.stage}
          onClose={() => setStageSheet(null)}
          onLogged={(stage) => {
            clearPendingCall();
            // Same confirmation as the direct outcomes — the sheet commits
            // optimistically, so by the time it closes the write is done.
            setLogged({ stage, label: labelForStage(stage, pipelineKind), status: "saved" });
          }}
          onSnack={showSnack}
        />
      )}
    </Box>
  );
}

/** The readable label for a stage, so a confirmation can say "Booked an
 *  appointment" rather than the bare stage name. Falls back to the stage. */
function labelForStage(stage: Stage, kind: PipelineKind): string {
  return MAIN_OUTCOME_OPTIONS[kind].find((o) => o.stage === stage)?.label ?? stage;
}

/** Local datetime string for an `<input type="datetime-local">`, which wants
 *  wall-clock time with no timezone suffix. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function atHour(daysAhead: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * "When is it?" — the step that was missing.
 *
 * Booking from the WhatsApp link used to write `reminder_at: null` and a label
 * of "Appt set", so the appointment existed but its time did not. Agents were
 * typing dates into the label by hand ("Appointment Sep 8") where nothing could
 * read them. One tap here produces a real timestamp.
 *
 * Three shortcuts cover the common cases; the picker is right there for the
 * rest, pre-filled so it's never an empty field to stare at.
 */
function WhenIsItStep({
  label,
  onPick,
  onCancel,
}: {
  label: string;
  onPick: (iso: string) => void;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState(() => toLocalInput(atHour(1, 9)));

  const quick: { text: string; at: Date }[] = [
    { text: "Today", at: atHour(0, Math.min(new Date().getHours() + 2, 18)) },
    { text: "Tomorrow 9am", at: atHour(1, 9) },
    { text: "Tomorrow 2pm", at: atHour(1, 14) },
  ];

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", p: "12px 14px" }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.25 }}>{label}</Typography>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1.25 }}>
        We'll remind you before it.
      </Typography>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        {quick.map((q) => (
          <Button
            key={q.text}
            onClick={() => onPick(q.at.toISOString())}
            variant="outlined"
            sx={{ textTransform: "none", fontWeight: 600, flex: "1 1 auto", minWidth: 110, py: 1 }}
          >
            {q.text}
          </Button>
        ))}
      </Box>

      <TextField
        type="datetime-local"
        label="Or pick a time"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        size="small"
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
        <Button onClick={onCancel} sx={{ textTransform: "none", color: "text.secondary" }}>
          Back
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          disabled={!custom}
          onClick={() => {
            const d = new Date(custom);
            if (!Number.isNaN(d.getTime())) onPick(d.toISOString());
          }}
          sx={{ textTransform: "none", fontWeight: 700, px: 3 }}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Persistent proof that the outcome saved, replacing the dropdown once used.
 *
 * Deliberately not a snackbar: this is the screen agents use most, usually
 * standing outside a property on a bad connection, and a toast that vanishes
 * after four seconds leaves them tapping the same option again "just in case".
 * Saving / saved / failed are all shown in place, and the follow-up the system
 * set for them is spelled out so they know what happens next.
 */
function LoggedConfirmation({
  label,
  status,
  nextLabel,
  reminderAt,
  onChange,
}: {
  label: string;
  status: "saving" | "saved" | "failed";
  nextLabel: string;
  reminderAt: string | null;
  onChange: () => void;
}) {
  const failed = status === "failed";
  const saving = status === "saving";
  const tone = failed
    ? { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b" }
    : { bg: "#e8f5e9", border: "#a5d6a7", fg: "#1b5e20" };

  return (
    <Box sx={{ bgcolor: tone.bg, border: `1px solid ${tone.border}`, borderRadius: "8px", p: "12px 14px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {saving ? (
          <CircularProgress size={18} sx={{ color: tone.fg }} />
        ) : failed ? (
          <ErrorOutlineIcon sx={{ fontSize: 20, color: tone.fg }} />
        ) : (
          <CheckCircleIcon sx={{ fontSize: 20, color: tone.fg }} />
        )}
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: tone.fg, letterSpacing: "0.02em" }}>
          {saving ? "Saving…" : failed ? "Didn't save" : "Logged"}
        </Typography>
      </Box>

      <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 0.5, lineHeight: 1.3 }}>{label}</Typography>

      {failed ? (
        <Typography sx={{ fontSize: 13, color: tone.fg, mt: 0.5, lineHeight: 1.45 }}>
          Check your signal and tap Change to try again.
        </Typography>
      ) : (
        !saving && nextLabel && nextLabel !== "—" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.75 }}>
            <EventAvailableIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography sx={{ fontSize: 13.5, color: "text.secondary", lineHeight: 1.4 }}>
              Next: <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>{nextLabel}</Box>
              {isUpcoming(reminderAt) && ` · ${whenLabel(reminderAt)}`}
            </Typography>
          </Box>
        )
      )}

      <Button
        onClick={onChange}
        size="small"
        sx={{ mt: 0.75, ml: -0.75, textTransform: "none", fontWeight: 600, color: tone.fg }}
      >
        {failed ? "Try again" : "Change"}
      </Button>
    </Box>
  );
}

/** A numbered step with a word label, so the flow reads as instructions to
 *  follow ("Step 1 · Call them") rather than a bare "1". */
function Step({ n, label, optional, children }: { n: number; label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1.25 }}>
      <Avatar sx={{ width: 26, height: 26, fontSize: 13, fontWeight: 700, bgcolor: tokens.primary, flex: "0 0 auto", mt: 0.25 }}>{n}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary", mb: 0.6 }}>
          Step {n} · {label}
          {optional && <Box component="span" sx={{ color: "text.disabled", fontWeight: 500 }}> (optional)</Box>}
        </Typography>
        {children}
      </Box>
    </Box>
  );
}

function InfoLine({ icon, value, href, strong }: { icon: React.ReactNode; value: string; href?: string; strong?: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 0.4 }}>
      <Box sx={{ color: "text.disabled", display: "flex" }}>{icon}</Box>
      {href ? (
        <Typography component="a" href={href} sx={{ fontSize: strong ? 16 : 14, fontWeight: strong ? 700 : 500, color: tokens.primaryDark, textDecoration: "none", wordBreak: "break-word" }}>
          {value}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: strong ? 15 : 14, fontWeight: strong ? 600 : 400, wordBreak: "break-word" }}>{value}</Typography>
      )}
    </Box>
  );
}

const STAGE_CHIP: Record<string, { bg: string; fg: string }> = {
  "New Lead": { bg: "#e6f4ea", fg: "#1e7e34" },
  "No Answer": { bg: "#fef3c7", fg: "#92400e" },
  "Contacted": { bg: "#e0f2fe", fg: "#075985" },
  "Booked": { bg: "#ede9fe", fg: "#5b21b6" },
  "Viewing Booked": { bg: "#ede9fe", fg: "#5b21b6" },
  "Mandate Signed": { bg: "#dcfce7", fg: "#166534" },
  "Offer Made": { bg: "#dcfce7", fg: "#166534" },
  "Bought": { bg: "#dcfce7", fg: "#166534" },
  "Lost": { bg: "#f3f4f6", fg: "#6b7280" },
  "Invalid Number": { bg: "#f3f4f6", fg: "#6b7280" },
};

function StageChip({ stage }: { stage: string }) {
  const c = STAGE_CHIP[stage] ?? { bg: "#f3f4f6", fg: "#374151" };
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", bgcolor: c.bg, color: c.fg, fontSize: 12, fontWeight: 700, borderRadius: "999px", px: 1.25, py: 0.35 }}>
      {stage}
    </Box>
  );
}
