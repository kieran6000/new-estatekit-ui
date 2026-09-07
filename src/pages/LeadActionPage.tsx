import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Button,
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
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useLeadWithStatus, useUpdateLeadNote, useUpdateLeadStage } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { useSnack } from "../hooks/useSnack";
import { pipelineKindFor, MAIN_OUTCOME_OPTIONS, STEP_FOR_STAGE, type MainOutcomeOption } from "../lib/stageLogic";
import { prettyAnswer } from "../lib/format";
import { timeAgo } from "../lib/timeAgo";
import { trackActivity } from "../lib/activity";
import { armPendingCall, clearPendingCall } from "../lib/pendingCall";
import { getLeadByToken, logOutcomeByToken } from "../api/leadActions";
import OutcomeSheet, { OUTCOME_ICONS, outcomeSnack } from "../components/OutcomeSheet";
import estateKitLogo from "../assets/blue logo full.png";
import type { LeadRow, OutcomeStep, PipelineKind, Stage } from "../types";

function isTokenFormat(s: string): boolean {
  return /^[a-f0-9]{8}$/.test(s);
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
    armPendingCall({ leadId: lead.id, name: lead.name, phone: lead.phone, startedAt: Date.now() });
    awaitingReturn.current = true;
    didHide.current = false;
    tapTime.current = Date.now();
  }

  function pickOutcome(opt: MainOutcomeOption) {
    if (!lead) return;
    // Signed out: the share token authorises the update. Follow-up questions
    // (when? / commission) are skipped — sensible defaults are applied server
    // side and can be refined later in the dashboard.
    if (!canEdit) {
      if (!token) return;
      logOutcomeByToken(token, opt.stage)
        .then(() => {
          clearPendingCall();
          showSnack(outcomeSnack(opt.stage));
          qc.invalidateQueries({ queryKey: ["leadByToken", token] });
        })
        .catch(() => showSnack("Couldn't save that — check your signal and try again"));
      return;
    }
    const sub = STEP_FOR_STAGE[opt.stage];
    if (sub) {
      setStageSheet({ step: sub, stage: opt.stage });
      return;
    }
    trackActivity("stage_change", {
      lead: { id: lead.id, name: lead.name, phone: lead.phone, fromStage: lead.stage, toStage: opt.stage, pipeline: pipelineKind },
    });
    updateStage.mutate({ id: lead.id, stage: opt.stage });
    clearPendingCall();
    showSnack(outcomeSnack(opt.stage));
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
  // Always open at the top — no mysterious mid-page scroll on load.
  useEffect(() => { window.scrollTo(0, 0); }, [lead?.id, isLoading]);

  function saveNote(value: string) {
    if (!lead || !canEdit) return;
    setSaveState("Saving…");
    updateNote.mutate(
      { id: lead.id, note: value },
      {
        onSuccess: () => setSaveState("Saved"),
        onError: () => setSaveState("Save failed"),
      },
    );
  }

  function onNoteChange(value: string) {
    setNote(value);
    if (!canEdit) return;
    setSaveState("Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNote(value), 500);
  }

  // Prefer the agent's own pipeline list; fall back to the server-resolved kind
  // when there's no session (token view), so buyer leads never show seller options.
  const pipelineKind: PipelineKind = lead
    ? pipelines.length
      ? pipelineKindFor(lead, pipelines)
      : kindHint ?? "seller"
    : "seller";
  const digits = lead?.phone.replace(/\D/g, "") ?? "";
  // Surface the property address right under the phone; keep it out of the
  // generic "From their form" list so it isn't shown twice.
  const addressAnswer = lead?.form_answers.find((a) => /address/i.test(a.q)) ?? null;
  const otherAnswers = lead ? lead.form_answers.filter((a) => a !== addressAnswer) : [];

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
            <Box sx={{ mt: 0.75 }}>
              <StageChip stage={lead.stage} />
            </Box>

            <Divider sx={{ my: 1 }} />

            <InfoLine icon={<CallIcon fontSize="small" />} value={lead.phone} href={`tel:${digits}`} strong />
            {lead.email && <InfoLine icon={<EmailOutlinedIcon fontSize="small" />} value={lead.email} href={`mailto:${lead.email}`} />}
            {addressAnswer && <InfoLine icon={<PlaceIcon fontSize="small" />} value={addressAnswer.a} />}

            {otherAnswers.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
                {otherAnswers.map((r, i) => (
                  <Box key={i} sx={{ bgcolor: tokens.bg, borderRadius: "8px", px: 1.25, py: 0.5, maxWidth: "100%" }}>
                    <Typography sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.15, textTransform: "uppercase", letterSpacing: "0.03em" }}>{r.q}</Typography>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25, wordBreak: "break-word" }}>{prettyAnswer(r.a)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {canLog ? (
            <>
              {/* Step 1 — call them */}
              <StepRow n={1}>
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
                  sx={{ ml: 1, color: "#25D366", border: `1px solid ${tokens.divider}`, borderRadius: "8px", width: 44, height: 44 }}
                >
                  <WhatsAppIcon />
                </IconButton>
              </StepRow>

              {/* Step 2 — come back and log what happened (pipeline-aware options) */}
              <StepRow n={2}>
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
                    value=""
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
              </StepRow>

              {/* One-line note — signed-in only (notes need a real session) */}
              {canEdit && (
                <TextField
                  value={note}
                  onChange={(e) => onNoteChange(e.target.value)}
                  onBlur={() => saveNote(note)}
                  placeholder="Add a note…"
                  size="small"
                  fullWidth
                  multiline
                  maxRows={2}
                  helperText={saveState || " "}
                  sx={{ mt: "auto", "& .MuiFormHelperText-root": { m: "2px 4px", fontSize: 11 } }}
                />
              )}
              {!canEdit && (
                <Button component="a" href="/leads" variant="outlined" startIcon={<ViewListIcon />} sx={{ mt: "auto" }}>
                  View all my leads
                </Button>
              )}
            </>
          ) : (
            /* Logged out (opened from a WhatsApp link): can still call/chat, and
               "View all my leads" routes them into sign-in. */
            <>
              <StepRow n={1}>
                <Button
                  component="a"
                  href={`tel:${digits}`}
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
                  sx={{ ml: 1, color: "#25D366", border: `1px solid ${tokens.divider}`, borderRadius: "8px", width: 44, height: 44 }}
                >
                  <WhatsAppIcon />
                </IconButton>
              </StepRow>
              <Button component="a" href="/leads" variant="outlined" startIcon={<ViewListIcon />} sx={{ mt: 1 }}>
                View all my leads
              </Button>
            </>
          )}
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
          onLogged={clearPendingCall}
          onSnack={showSnack}
        />
      )}
    </Box>
  );
}

function StepRow({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
      <Avatar sx={{ width: 24, height: 24, fontSize: 13, fontWeight: 700, bgcolor: tokens.primary, flex: "0 0 auto" }}>{n}</Avatar>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>{children}</Box>
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
