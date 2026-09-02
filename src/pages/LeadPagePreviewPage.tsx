import { useParams } from "react-router-dom";
import { Box, Skeleton, Typography } from "@mui/material";
import { tokens } from "../theme";
import { useLeadPages, useSubmitMockLead } from "../hooks/useLeadPages";
import { usePipelines } from "../hooks/usePipelines";
import { useCustomQuestions } from "../hooks/useCustomQuestions";
import type { Pipeline } from "../types";
import LeadCaptureForm from "../components/LeadCaptureForm";

/**
 * The actual public page a lead lands on after tapping a "My Page" share
 * link (`ek.co/p/...`) — public, no login, no AppShell nav, not linked from
 * anywhere in the dashboard except the "Open live preview" link on My Page.
 * Renders the exact same LeadCaptureForm the editor's Live Preview shows,
 * full-page instead of boxed in a two-column layout, and a real submit —
 * not a demo one — so previewing it here is previewing the real thing.
 */
export default function LeadPagePreviewPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const { data: pages, isLoading: pagesLoading } = useLeadPages();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const page = pages?.find((p) => p.id === pageId);
  const pipeline: Pipeline | undefined = pipelines.find((p) => p.id === page?.pipelineId);
  const { data: customQuestions = [] } = useCustomQuestions(pageId ?? "");
  const submitLead = useSubmitMockLead();

  const loading = pagesLoading || pipelinesLoading;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg, display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
      <Box sx={{ width: "100%", maxWidth: 480 }}>
        {loading ? (
          <Skeleton variant="rounded" height={420} sx={{ borderRadius: "8px" }} />
        ) : !page || !pipeline ? (
          <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">This page isn't available.</Typography>
          </Box>
        ) : (
          <LeadCaptureForm
            page={page}
            pipelineKind={pipeline.kind}
            customQuestions={customQuestions}
            onSubmit={async ({ name, phone, answers }) => {
              await submitLead.mutateAsync({ pageId: page.id, name, phone, formAnswers: answers });
            }}
          />
        )}
      </Box>
    </Box>
  );
}
