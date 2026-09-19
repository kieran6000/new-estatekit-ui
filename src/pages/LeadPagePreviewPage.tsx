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
import { trackPageEvent } from "../lib/pageTracking";
import { captureAttribution, readAttribution } from "../lib/adAttribution";
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

  const { data: customQuestions = [], isLoading: questionsLoading } = useQuery({
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

  useEffect(() => {
    if (page?.id) trackPageEvent(page.id, "view");
  }, [page?.id]);

  // Stash which ad/campaign sent them before they start the form — the query
  // string is only present on this first hit, and the form is multi-step.
  useEffect(() => {
    if (page?.id) captureAttribution(page.id);
  }, [page?.id]);

  // Wait for the questions too: rendering the form before they arrive briefly
  // shows the contact step as step 1 (and used to count a fake "reached contact").
  const loading = pageLoading || pipelineLoading || (!!page && questionsLoading);

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
            <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff" }}>
              <Skeleton variant="rectangular" animation="wave" height={4} />
              <Box sx={{ p: "28px 24px" }}>
                <Skeleton variant="text" animation="wave" width={90} height={16} sx={{ mb: 2 }} />
                <Skeleton variant="text" animation="wave" width="80%" height={28} sx={{ mb: 2.5 }} />
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} variant="rounded" animation="wave" height={52} sx={{ borderRadius: "8px", mb: 1.25 }} />
                ))}
                <Skeleton variant="rounded" animation="wave" height={48} sx={{ borderRadius: "8px", mt: 2 }} />
              </Box>
            </Box>
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
                onSubmit={({ name, phone, email, answers }) => {
                  // Fire the pixel + navigate to /thank-you IMMEDIATELY (most pixels
                  // trigger on the thank-you route). The DB insert runs in the
                  // background — client-side nav doesn't unload the page, so the
                  // request completes without blocking the visitor.
                  void submitMockLead(page.id, name, phone, answers, email, readAttribution(page.id)).catch(() => {});
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
