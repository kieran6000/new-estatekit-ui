import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import { tokens } from "../theme";
import { getLeadPageBySlug, submitMockLead } from "../api/leadPages";
import { getPipelinePublic } from "../api/pipelines";
import { listCustomQuestionsPublic } from "../api/customQuestions";
import LeadCaptureForm, { HeaderBrand } from "../components/LeadCaptureForm";
import { initPixel, trackPixel } from "../lib/fbPixel";
import { listSoldListingsForAgent } from "../api/soldListings";
import { SoldStrip } from "../components/SoldListings";

export default function LeadPagePreviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const posthog = usePostHog();

  const { data: page, isLoading: pageLoading } = useQuery({
    queryKey: ["publicPageSlug", slug],
    queryFn: () => getLeadPageBySlug(slug!),
    enabled: !!slug,
  });

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ["publicPipeline", page?.pipelineId],
    queryFn: () => getPipelinePublic(page!.pipelineId),
    enabled: !!page?.pipelineId,
  });

  const { data: customQuestions = [] } = useQuery({
    queryKey: ["publicQuestions", page?.id],
    queryFn: () => listCustomQuestionsPublic(page!.id),
    enabled: !!page?.id,
  });

  const { data: soldListings = [] } = useQuery({
    queryKey: ["publicSold", page?.agentId],
    queryFn: () => listSoldListingsForAgent(page!.agentId),
    enabled: !!page?.agentId,
  });

  useEffect(() => {
    if (page?.fbPixelId) initPixel(page.fbPixelId);
  }, [page?.fbPixelId]);

  const loading = pageLoading || pipelineLoading;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      {!loading && page && (
        <Box sx={{ bgcolor: page.accentColor, color: "#fff", p: "14px 20px", textAlign: "center" }}>
          <HeaderBrand page={page} />
        </Box>
      )}

      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <Box sx={{ width: "100%", maxWidth: 480, mt: loading || !page ? 0 : 2.5 }}>
          {loading ? (
            <Skeleton variant="rounded" height={420} sx={{ borderRadius: "8px" }} />
          ) : !page || !pipeline ? (
            <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", p: 4, textAlign: "center" }}>
              <Typography color="text.secondary">This page isn't available.</Typography>
            </Box>
          ) : (
            <>
              <LeadCaptureForm
                page={page}
                pipelineKind={pipeline.kind}
                customQuestions={customQuestions}
                showHeader={false}
                onSubmit={async ({ name, phone, email, answers }) => {
                  await submitMockLead(page.id, name, phone, answers, email);
                  trackPixel("Lead");
                  posthog.capture("lead_page_form_submitted", { pipeline: pipeline.kind });
                  navigate(`/thank-you?p=${page.slug}&n=${encodeURIComponent(name.split(" ")[0] || "there")}`);
                }}
              />

              {soldListings.length > 0 && (
                <Box sx={{ mt: 2.5 }}>
                  <SoldStrip listings={soldListings} area={page.suburb} accent={page.accentColor} />
                </Box>
              )}

              <Typography sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.5, mt: 2, textAlign: "center", px: 1 }}>
                By submitting this form, you agree to be contacted by{" "}
                {page.agentName || "our team"} via phone, email, and SMS
                regarding your property enquiry. Message and data rates may
                apply. You can unsubscribe at any time. Not intended to
                solicit buyers or sellers currently under contract with an
                agent.{" "}
                <Box
                  component="a"
                  href="/privacy"
                  target="_blank"
                  rel="noopener"
                  sx={{ color: "text.secondary", textDecoration: "underline" }}
                >
                  Privacy Policy
                </Box>
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
