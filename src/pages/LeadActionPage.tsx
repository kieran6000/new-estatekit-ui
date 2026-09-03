import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Paper, Skeleton, TextField, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useLeadWithStatus, useUpdateLeadNote } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { useLeadPages } from "../hooks/useLeadPages";
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

  if (isToken || !isAuthed) {
    return <TokenLeadActionPage token={leadId ?? ""} />;
  }
  return <AuthedLeadActionPage leadId={leadId ?? ""} />;
}

function TokenLeadActionPage({ token }: { token: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["leadByToken", token],
    queryFn: () => getLeadByToken(token),
    enabled: !!token,
  });

  const lead = data?.lead ?? null;

  return <LeadActionUI lead={lead} isLoading={isLoading} canEdit={false} />;
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
  const { data: pages = [] } = useLeadPages({ enabled: canEdit });
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
  const sourcePage = lead?.source_page_id
    ? pages.find((p) => p.id === lead.source_page_id)
    : undefined;
  const digits = lead?.phone.replace(/\D/g, "") ?? "";

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: tokens.bg,
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          p: "10px 16px",
          bgcolor: "background.paper",
          borderBottom: `1px solid ${tokens.divider}`,
        }}
      >
        <Box
          component="img"
          src={estateKitLogo}
          alt="EstateKit"
          sx={{ height: 22 }}
        />
      </Box>

      {isLoading ? (
        <LeadActionSkeleton />
      ) : !lead ? (
        <Box sx={{ p: 4 }}>
          <Typography color="text.secondary">
            This link isn't valid or has expired.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <Box sx={{ maxWidth: 720, mx: "auto", pb: 3 }}>
              <Typography sx={{ fontSize: 19, fontWeight: 600, m: "16px 16px 0" }}>
                {lead.name}
              </Typography>

              <Section title="Contact">
                <Row k="Phone" v={lead.phone} />
                <Row k="Email" v={lead.email || ""} />
                <Row k="Stage" v={lead.stage} />
                <Row k="Next" v={lead.next_label} />
                <Row
                  k="Came from"
                  v={sourcePage ? sourcePage.name : "Added manually"}
                />
              </Section>

              <Section title="From their form">
                {lead.form_answers.length ? (
                  lead.form_answers.map((r, i) => (
                    <Row key={i} k={r.q} v={r.a} />
                  ))
                ) : (
                  <Row k="" v="No answers captured." />
                )}
              </Section>

              {canEdit && (
                <Section title="Notes">
                  <TextField
                    multiline
                    minRows={4}
                    fullWidth
                    placeholder="Add a note about this lead…"
                    value={note}
                    onChange={(e) => onNoteChange(e.target.value)}
                    onBlur={() => saveNote(note)}
                    sx={{ mx: 2, mt: 1, mb: 0.5, width: "calc(100% - 32px)" }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.disabled",
                      px: 2,
                      pb: 1.75,
                      display: "block",
                      height: 18,
                    }}
                  >
                    {saveState}
                  </Typography>
                </Section>
              )}

              <Typography
                component="a"
                href="/leads"
                sx={{
                  display: "block",
                  textAlign: "center",
                  mt: 2,
                  fontSize: 13,
                  color: "text.disabled",
                  textDecoration: "none",
                  "&:hover": { color: tokens.primary },
                }}
              >
                Go to dashboard
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              flexShrink: 0,
              display: "flex",
              gap: 1.25,
              p: "12px 16px",
              bgcolor: "background.paper",
              borderTop: `1px solid ${tokens.divider}`,
            }}
          >
            <Box
              component="a"
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener"
              sx={{
                flex: 1,
                bgcolor: "#fff",
                color: "#25D366",
                border: `1px solid ${tokens.divider}`,
                borderRadius: "4px",
                p: "14px",
                fontWeight: 500,
                fontSize: 14,
                textTransform: "uppercase",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                textDecoration: "none",
                "&:hover": { bgcolor: tokens.hover },
              }}
            >
              <WhatsAppIcon fontSize="small" /> WhatsApp
            </Box>
            <Box
              component="a"
              href={`tel:${digits}`}
              onClick={() => canEdit && setTimeout(() => setOutcomeOpen(true), 150)}
              sx={{
                flex: 1,
                bgcolor: tokens.green,
                color: "#fff",
                borderRadius: "4px",
                p: "14px",
                fontWeight: 500,
                fontSize: 14,
                textTransform: "uppercase",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                textDecoration: "none",
                "&:hover": { bgcolor: tokens.greenDark },
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

function LeadActionSkeleton() {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto", pb: 3, p: 2 }}>
      <Skeleton variant="text" width={180} height={32} sx={{ mb: 1 }} />
      <Skeleton
        variant="rounded"
        height={64}
        sx={{ mb: 1.5, borderRadius: "6px" }}
      />
      <Skeleton
        variant="rounded"
        height={140}
        sx={{ mb: 1.5, borderRadius: "6px" }}
      />
      <Skeleton variant="rounded" height={100} sx={{ borderRadius: "6px" }} />
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ mt: 1.5, mx: 2, borderRadius: "6px" }}>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 500,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          p: "14px 16px 4px",
        }}
      >
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        p: "10px 16px",
        borderTop: `1px solid ${tokens.divider2}`,
        gap: 1.5,
        "&:first-of-type": { borderTop: 0 },
      }}
    >
      {k && (
        <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>
          {k}
        </Typography>
      )}
      <Typography sx={{ fontSize: 14, flex: 1 }}>{v}</Typography>
    </Box>
  );
}
