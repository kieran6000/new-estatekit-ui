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
import { useLeadWithStatus, useUpdateLeadNote } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { useSnack } from "../hooks/useSnack";
import { pipelineKindFor } from "../lib/stageLogic";
import { prettyAnswer } from "../lib/format";
import { timeAgo } from "../lib/timeAgo";
import { getLeadByToken } from "../api/leadActions";
import OutcomeSheet from "../components/OutcomeSheet";
import estateKitLogo from "../assets/blue logo full.png";
import type { LeadRow } from "../types";

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
  const showSnack = useSnack();

  const [note, setNote] = useState(lead?.note ?? "");
  const [saveState, setSaveState] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

            {canEdit && (
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
            )}
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
            <Box sx={{ display: "flex", gap: 1, maxWidth: 480, mx: "auto", width: "100%" }}>
              <Box
                component="a"
                href={`https://wa.me/${digits}`}
                target="_blank"
                rel="noopener"
                sx={{
                  flex: 1, bgcolor: "#fff", color: "#25D366", border: `1px solid ${tokens.divider}`,
                  borderRadius: "8px", p: "13px", fontWeight: 600, fontSize: 14,
                  textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 1, textDecoration: "none", "&:hover": { bgcolor: "#f0fdf4" },
                }}
              >
                <WhatsAppIcon fontSize="small" /> WhatsApp
              </Box>
              <Box
                component="a"
                href={`tel:${digits}`}
                onClick={() => canEdit && setTimeout(() => setOutcomeOpen(true), 150)}
                sx={{
                  flex: 1, bgcolor: tokens.green, color: "#fff",
                  borderRadius: "8px", p: "13px", fontWeight: 600, fontSize: 14,
                  textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 1, textDecoration: "none", "&:hover": { bgcolor: tokens.greenDark },
                }}
              >
                <CallIcon fontSize="small" /> Call
              </Box>
            </Box>
          </Box>

          {canEdit && (
            <OutcomeSheet
              lead={lead}
              pipelineKind={pipelineKind}
              open={outcomeOpen}
              onClose={() => setOutcomeOpen(false)}
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
