import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ViewListIcon from "@mui/icons-material/ViewList";
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
import { getLeadByToken } from "../api/leadActions";
import OutcomeSheet, { OUTCOME_ICONS, outcomeSnack } from "../components/OutcomeSheet";
import estateKitLogo from "../assets/blue logo full.png";
import type { LeadRow, OutcomeStep, Stage } from "../types";

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

  return <LeadActionUI lead={lead} isLoading={isLoading} canEdit={canEdit} />;
}

function AuthedLeadActionPage({ leadId }: { leadId: string }) {
  const { lead, isLoading } = useLeadWithStatus(leadId);
  return <LeadActionUI lead={lead ?? null} isLoading={isLoading} canEdit={true} />;
}

function LeadActionUI({
  lead,
  isLoading,
  canEdit,
}: {
  lead: LeadRow | null;
  isLoading: boolean;
  canEdit: boolean;
}) {
  const { data: pipelines = [] } = usePipelines({ enabled: canEdit });
  const updateNote = useUpdateLeadNote();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  // The follow-up sheet (when? / reminder / commission) — only for outcomes that
  // need a second answer. The outcome list itself lives inline on the page.
  const [stageSheet, setStageSheet] = useState<{ step: OutcomeStep; stage: Stage } | null>(null);
  const [highlight, setHighlight] = useState(false);
  const outcomeRef = useRef<HTMLDivElement | null>(null);
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
    outcomeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(true);
    setTimeout(() => setHighlight(false), 2200);
  }

  function onCallTap() {
    if (!canEdit || !lead) return;
    trackActivity("call_started", { lead: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage } });
    armPendingCall({ leadId: lead.id, name: lead.name, phone: lead.phone, startedAt: Date.now() });
    awaitingReturn.current = true;
    didHide.current = false;
    tapTime.current = Date.now();
  }

  function pickOutcome(opt: MainOutcomeOption) {
    if (!lead || !canEdit) return;
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

  const pipelineKind = lead ? pipelineKindFor(lead, pipelines) : "seller";
  const digits = lead?.phone.replace(/\D/g, "") ?? "";
  // Surface the property address right under the phone; keep it out of the
  // generic "From their form" list so it isn't shown twice.
  const addressAnswer = lead?.form_answers.find((a) => /address/i.test(a.q)) ?? null;
  const otherAnswers = lead ? lead.form_answers.filter((a) => a !== addressAnswer) : [];

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: tokens.bg, pb: lead && !isLoading ? "78px" : 0 }}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 22 }} />
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: 2, minHeight: "60vh" }}>
          <Box sx={{ width: "100%", maxWidth: 460 }}>
            <Skeleton variant="rounded" height={200} sx={{ borderRadius: "12px" }} />
          </Box>
        </Box>
      ) : !lead ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: 3, minHeight: "70vh" }}>
          <Box sx={{ textAlign: "center", maxWidth: 320 }}>
            <LinkOffIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
            <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>Link not valid</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", lineHeight: 1.6 }}>
              This link has expired or isn't valid. Ask your agent for a new one.
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          <Box sx={{ maxWidth: 480, mx: "auto", p: "12px 12px 0" }}>
            <Box sx={{ bgcolor: "background.paper", borderRadius: "12px", border: `1px solid ${tokens.divider}`, overflow: "hidden" }}>
              {/* Header: who + status, scannable at a glance */}
              <Box sx={{ p: "14px 16px 12px", borderBottom: `1px solid ${tokens.divider}` }}>
                <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>{lead.name}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                  <StageChip stage={lead.stage} />
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>· came in {timeAgo(lead.created_at)}</Typography>
                </Box>
              </Box>

              {/* Contact — phone + address first, both prominent */}
              <Box sx={{ p: "6px 16px" }}>
                <InfoRow label="Phone" value={lead.phone} href={`tel:${digits}`} strong />
                {addressAnswer && <InfoRow label="Address" value={addressAnswer.a} strong />}
                {lead.email && <InfoRow label="Email" value={lead.email} href={`mailto:${lead.email}`} />}
                {lead.next_label && lead.next_label !== "—" && <InfoRow label="Next" value={lead.next_label} />}
              </Box>

              {otherAnswers.length > 0 && (
                <Box sx={{ borderTop: `1px solid ${tokens.divider}`, p: "10px 16px" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.5 }}>From their form</Typography>
                  {otherAnswers.map((r, i) => (
                    <InfoRow key={i} label={r.q} value={prettyAnswer(r.a)} />
                  ))}
                </Box>
              )}

              {canEdit && (
                <Box sx={{ borderTop: `1px solid ${tokens.divider}`, p: "10px 16px" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.5 }}>Notes</Typography>
                  <Box
                    component="textarea"
                    value={note}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onNoteChange(e.target.value)}
                    onBlur={() => saveNote(note)}
                    placeholder="Add a note…"
                    rows={2}
                    sx={{
                      width: "100%", boxSizing: "border-box", border: `1px solid ${tokens.divider}`, borderRadius: "6px",
                      p: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "none",
                      "&:focus": { outline: `2px solid ${tokens.primary}`, borderColor: "transparent" },
                    }}
                  />
                  {saveState && <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.25 }}>{saveState}</Typography>}
                </Box>
              )}
            </Box>

            {/* Outcome capture lives right on the page — log what happened any
                time, not only after a call. Returning from the dialer flashes
                this card into view. */}
            {canEdit && (
              <Box
                ref={outcomeRef}
                sx={{
                  mt: 1.25, bgcolor: "background.paper", borderRadius: "12px", overflow: "hidden",
                  border: `1px solid ${highlight ? tokens.primary : tokens.divider}`,
                  boxShadow: highlight ? `0 0 0 3px ${tokens.primaryBg}` : "none",
                  transition: "box-shadow .3s ease, border-color .3s ease",
                }}
              >
                <Box sx={{ p: "12px 16px 6px" }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 700 }}>How did it go?</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Tap what happened.</Typography>
                </Box>
                {MAIN_OUTCOME_OPTIONS[pipelineKind].map((opt) => (
                  <Box
                    key={opt.label}
                    component="button"
                    onClick={() => pickOutcome(opt)}
                    sx={{
                      width: "100%", display: "flex", alignItems: "center", gap: 1.5,
                      border: 0, borderTop: `1px solid ${tokens.divider2}`, bgcolor: "transparent",
                      p: "14px 16px", cursor: "pointer", textAlign: "left", fontSize: 15,
                      fontFamily: "inherit", color: "inherit",
                      "&:hover": { bgcolor: tokens.primaryBg },
                    }}
                  >
                    <Box sx={{ color: "text.secondary", display: "flex" }}>{OUTCOME_ICONS[opt.icon]}</Box>
                    {opt.label}
                  </Box>
                ))}
              </Box>
            )}

            {/* Always shown — for a logged-in agent it opens their list; for a
                lead opened from a WhatsApp link (not logged in) it's the way
                into the dashboard (routes to the sign-in screen). */}
            <Box
              component="a"
              href="/leads"
              sx={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75,
                mt: 1.25, p: "12px", borderRadius: "8px", border: `1px solid ${tokens.divider}`,
                bgcolor: "#fff", color: tokens.primaryDark, fontSize: 14, fontWeight: 600,
                textDecoration: "none", "&:hover": { bgcolor: tokens.primaryBg },
              }}
            >
              <ViewListIcon sx={{ fontSize: 18 }} /> View all my leads
            </Box>
          </Box>

          {/* Fixed action bar — always visible, page flows above it. */}
          <Box
            sx={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 3,
              display: "flex",
              gap: 1,
              p: "10px 12px",
              bgcolor: "background.paper",
              borderTop: `1px solid ${tokens.divider}`,
              boxShadow: "0 -2px 8px rgba(0,0,0,.06)",
              pb: "calc(10px + env(safe-area-inset-bottom))",
            }}
          >
            {/* Call is the one dominant action; WhatsApp is a compact secondary
                so there's no "which do I press?" hesitation. */}
            <Box sx={{ display: "flex", gap: 1, maxWidth: 480, mx: "auto", width: "100%" }}>
              <Box
                component="a"
                href={`https://wa.me/${digits}`}
                target="_blank"
                rel="noopener"
                aria-label="Message on WhatsApp"
                sx={{
                  flex: "0 0 auto", width: 116, bgcolor: "#fff", color: "#25D366", border: `1px solid ${tokens.divider}`,
                  borderRadius: "8px", p: "13px", fontWeight: 600, fontSize: 13.5,
                  textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 0.75, textDecoration: "none", "&:hover": { bgcolor: "#f0fdf4" },
                }}
              >
                <WhatsAppIcon fontSize="small" /> Chat
              </Box>
              <Box
                component="a"
                href={`tel:${digits}`}
                onClick={onCallTap}
                sx={{
                  flex: 1, bgcolor: tokens.green, color: "#fff",
                  borderRadius: "8px", p: "15px", fontWeight: 700, fontSize: 16,
                  textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 1, textDecoration: "none", "&:hover": { bgcolor: tokens.greenDark },
                }}
              >
                <CallIcon fontSize="small" /> Call {lead.name.split(" ")[0]}
              </Box>
            </Box>
          </Box>

          {canEdit && (
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
        </>
      )}
    </Box>
  );
}

function InfoRow({ label, value, href, strong }: { label: string; value: string; href?: string; strong?: boolean }) {
  return (
    <Box sx={{ display: "flex", py: "7px", borderBottom: `1px solid ${tokens.divider2}`, gap: 1, alignItems: "baseline", "&:last-child": { borderBottom: 0 } }}>
      <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 34%", wordBreak: "break-word" }}>{label}</Typography>
      {href ? (
        <Typography component="a" href={href} sx={{ fontSize: strong ? 15 : 14, fontWeight: strong ? 700 : 500, flex: 1, wordBreak: "break-word", color: tokens.primaryDark, textDecoration: "none" }}>
          {value}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: strong ? 15 : 14, fontWeight: strong ? 700 : 400, flex: 1, wordBreak: "break-word" }}>{value}</Typography>
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
