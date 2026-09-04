import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useLeadWithStatus, useUpdateLeadNote } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { useSnack } from "../hooks/useSnack";
import { pipelineKindFor } from "../lib/stageLogic";
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

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: tokens.bg }}>
      <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", p: "12px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 22 }} />
      </Box>

      {isLoading ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
          <Box sx={{ width: "100%", maxWidth: 400 }}>
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
        <>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", justifyContent: "center", p: 2 }}>
            <Box sx={{ width: "100%", maxWidth: 480 }}>
              <Box sx={{ bgcolor: "background.paper", borderRadius: "12px", border: `1px solid ${tokens.divider}`, overflow: "hidden" }}>
                <Box sx={{ p: "12px 16px" }}>
                  <InfoRow label="Name" value={lead.name} />
                  <InfoRow label="Phone" value={lead.phone} />
                  {lead.email && <InfoRow label="Email" value={lead.email} />}
                  <InfoRow label="Stage" value={lead.stage} />
                  {lead.next_label && lead.next_label !== "—" && <InfoRow label="Next" value={lead.next_label} />}
                </Box>

                {lead.form_answers.length > 0 && (
                  <Box sx={{ borderTop: `1px solid ${tokens.divider}`, p: "12px 16px" }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.75 }}>From their form</Typography>
                    {lead.form_answers.map((r, i) => (
                      <InfoRow key={i} label={r.q} value={r.a} />
                    ))}
                  </Box>
                )}

                {canEdit && (
                  <Box sx={{ borderTop: `1px solid ${tokens.divider}`, p: "12px 16px" }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.75 }}>Notes</Typography>
                    <Box
                      component="textarea"
                      value={note}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onNoteChange(e.target.value)}
                      onBlur={() => saveNote(note)}
                      placeholder="Add a note…"
                      rows={2}
                      sx={{
                        width: "100%", border: `1px solid ${tokens.divider}`, borderRadius: "6px",
                        p: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical",
                        "&:focus": { outline: `2px solid ${tokens.primary}`, borderColor: "transparent" },
                      }}
                    />
                    {saveState && <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.5 }}>{saveState}</Typography>}
                  </Box>
                )}
              </Box>

              {canEdit && (
                <Typography
                  component="a"
                  href="/leads"
                  sx={{ display: "block", textAlign: "center", mt: 2, fontSize: 13, color: "text.disabled", textDecoration: "none", "&:hover": { color: tokens.primary } }}
                >
                  Go to dashboard
                </Typography>
              )}
            </Box>
          </Box>

          <Box
            sx={{
              flexShrink: 0,
              position: "sticky",
              bottom: 0,
              display: "flex",
              gap: 1,
              p: "12px 16px",
              bgcolor: "background.paper",
              borderTop: `1px solid ${tokens.divider}`,
              boxShadow: "0 -2px 8px rgba(0,0,0,.06)",
              maxWidth: "100%",
            }}
          >
            <Box
              component="a"
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener"
              sx={{
                flex: 1, bgcolor: "#fff", color: "#25D366", border: `1px solid ${tokens.divider}`,
                borderRadius: "8px", p: "14px", fontWeight: 600, fontSize: 14,
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
                borderRadius: "8px", p: "14px", fontWeight: 600, fontSize: 14,
                textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 1, textDecoration: "none", "&:hover": { bgcolor: tokens.greenDark },
              }}
            >
              <CallIcon fontSize="small" /> Call
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", py: "8px", borderBottom: `1px solid ${tokens.divider2}`, gap: 1, "&:last-child": { borderBottom: 0 } }}>
      <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 40%", wordBreak: "break-word" }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, flex: 1, wordBreak: "break-word" }}>{value}</Typography>
    </Box>
  );
}
