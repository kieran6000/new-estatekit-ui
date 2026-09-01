import { useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircleRounded";
import { tokens } from "../theme";
import { useLead } from "../hooks/useLeads";
import { usePipelines } from "../hooks/usePipelines";
import { pipelineKindFor } from "../lib/stageLogic";
import OutcomeOptionsInline from "../components/OutcomeOptionsInline";

/**
 * The page a WhatsApp lead-action link (see AdminAutomationsPage) opens —
 * a one-tap "how did it go?" for one specific lead, aligned with the same
 * pipeline/stage-aware outcome flow used everywhere else in the app. Public:
 * no login, no AppShell nav, and not linked from anywhere in the dashboard —
 * reachable only by its own URL (an agent gets there from a WhatsApp tap).
 * Whatever they log here updates that lead's real stage in its pipeline,
 * same as picking it from the dashboard would.
 */
export default function LeadActionPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const lead = useLead(leadId);
  const { data: pipelines = [] } = usePipelines();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg, display: "flex", flexDirection: "column", alignItems: "center", p: 2 }}>
      <Box sx={{ width: "100%", maxWidth: 420, mt: { xs: 2, sm: 6 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5, px: 0.5 }}>
          <Box sx={{ width: 22, height: 22, borderRadius: "5px", bgcolor: tokens.primary }} />
          <Typography sx={{ fontSize: 17, fontWeight: 700 }}>EstateKit</Typography>
        </Box>

        <Box sx={{ bgcolor: "background.paper", borderRadius: "10px", boxShadow: "0 1px 2px rgba(0,0,0,.1)", p: 2.5 }}>
          {!lead ? (
            <Typography color="text.secondary">This link isn't valid or has expired.</Typography>
          ) : message ? (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 40, color: tokens.green, mb: 1 }} />
              <Typography sx={{ fontWeight: 500, fontSize: 16 }}>{message}</Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.5 }}>
                {lead.name}'s record has been updated. You can close this page.
              </Typography>
            </Box>
          ) : (
            <>
              <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Quick lead update
              </Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 600, mt: 0.25 }}>{lead.name}</Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 14, mb: 2 }}>{lead.phone}</Typography>
              <OutcomeOptionsInline
                lead={lead}
                pipelineKind={pipelineKindFor(lead, pipelines)}
                resetKey={lead.id}
                onDone={(msg) => setMessage(msg)}
              />
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
