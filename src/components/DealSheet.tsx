import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Link,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tokens } from "../theme";
import {
  DEAL_DEAD_STAGES,
  DEAL_STAGE_HINT,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_ORDER,
  DEAL_STAGE_TONE,
  type DealStage,
} from "../lib/dealStage";
import { moveAgencyDeal, updateAgencyDeal, type AgencyDeal } from "../api/agencyDeals";

const TONE_COLOR: Record<string, string> = {
  grey: tokens.ink3,
  blue: tokens.primary,
  amber: tokens.amber,
  green: tokens.green,
  red: tokens.red,
};

function waLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/** A labelled row the operator can edit in place and that saves on blur. */
function Field({
  label,
  value,
  onSave,
  type = "text",
  multiline = false,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <TextField
      label={label}
      value={v}
      type={type}
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      size="small"
      fullWidth
      slotProps={type === "date" ? { inputLabel: { shrink: true } } : undefined}
    />
  );
}

export default function DealSheet({ deal, onClose }: { deal: AgencyDeal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const wide = useMediaQuery("(min-width:900px)");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["agencyDeals"] });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateAgencyDeal>[1]) => updateAgencyDeal(deal!.id, patch),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: (stage: DealStage) => moveAgencyDeal(deal!, stage),
    onSuccess: invalidate,
  });

  if (!deal) return null;
  const wa = waLink(deal.phone);

  return (
    <Drawer
      anchor={wide ? "right" : "bottom"}
      open={!!deal}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: wide ? 460 : "100%", maxHeight: wide ? "100%" : "92vh", bgcolor: "background.default" } } }}
    >
      {/* Header */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 600, lineHeight: 1.2 }} noWrap>
              {deal.name}
            </Typography>
            <Typography sx={{ fontSize: 13, color: tokens.ink3 }} noWrap>
              {[deal.agency, deal.area].filter(Boolean).join(" · ") || "No agency on file"}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={DEAL_STAGE_LABEL[deal.stage]}
            sx={{ bgcolor: `${TONE_COLOR[DEAL_STAGE_TONE[deal.stage]]}22`, color: TONE_COLOR[DEAL_STAGE_TONE[deal.stage]], fontWeight: 600 }}
          />
          <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          {wa && (
            <Button size="small" variant="outlined" startIcon={<WhatsAppIcon sx={{ color: tokens.greenCall }} />} href={wa} target="_blank">
              WhatsApp
            </Button>
          )}
          {deal.phone && (
            <Button size="small" variant="outlined" href={`tel:${deal.phone}`}>Call</Button>
          )}
        </Stack>
      </Box>

      <Box sx={{ p: 2 }}>
        <Stack spacing={2.5}>
          {/* Move the deal */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink3, mb: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Move to
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {[...DEAL_STAGE_ORDER, ...DEAL_DEAD_STAGES].map((s) => {
                const on = s === deal.stage;
                const c = TONE_COLOR[DEAL_STAGE_TONE[s]];
                return (
                  <Chip
                    key={s}
                    label={DEAL_STAGE_LABEL[s]}
                    onClick={() => !on && move.mutate(s)}
                    title={DEAL_STAGE_HINT[s]}
                    sx={{
                      cursor: on ? "default" : "pointer",
                      fontWeight: on ? 700 : 500,
                      bgcolor: on ? `${c}22` : "transparent",
                      color: on ? c : tokens.ink2,
                      border: `1px solid ${on ? c : tokens.outline}`,
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          {/* Discovery scorecard */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink3, mb: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Discovery scorecard
            </Typography>
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1}>
                <Field label="Leads / month" type="number" value={deal.leads_per_month?.toString() ?? ""} onSave={(v) => save.mutate({ leads_per_month: v ? Number(v) : null })} />
                <Field label="Deals / month" type="number" value={deal.deals_per_month?.toString() ?? ""} onSave={(v) => save.mutate({ deals_per_month: v ? Number(v) : null })} />
              </Stack>
              <Field label="Tried before" value={deal.tried_before ?? ""} placeholder="e.g. Property24, a Fiverr freelancer" onSave={(v) => save.mutate({ tried_before: v || null })} />
              <Field label="What it cost them" value={deal.tried_before_cost ?? ""} placeholder="e.g. R2,000, no results" onSave={(v) => save.mutate({ tried_before_cost: v || null })} />
              <Field label="Budget" value={deal.budget ?? ""} placeholder="e.g. R70/day" onSave={(v) => save.mutate({ budget: v || null })} />
              <Field label="Target suburbs" value={deal.target_suburbs ?? ""} placeholder="for the area clash check" onSave={(v) => save.mutate({ target_suburbs: v || null })} />
              <Field label="Decision date" type="date" value={deal.decision_date ?? ""} onSave={(v) => save.mutate({ decision_date: v || null })} />
              <Field label="Notes" multiline value={deal.scorecard_notes ?? ""} onSave={(v) => save.mutate({ scorecard_notes: v || null })} />
            </Stack>
          </Box>

          {/* Lead's own form answers, if it came from /pitch */}
          {deal.form_answers.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink3, mb: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>
                From the application
              </Typography>
              <Stack spacing={0.5}>
                {deal.form_answers.map((a, i) => (
                  <Typography key={i} sx={{ fontSize: 13.5 }}>
                    <span style={{ color: tokens.ink3 }}>{a.q} </span>
                    <strong>{a.a}</strong>
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}

          {/* The call */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink3, mb: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Discovery call
            </Typography>
            <Stack spacing={1.25}>
              <Field label="Fathom link" value={deal.fathom_url ?? ""} placeholder="https://fathom.video/calls/…" onSave={(v) => save.mutate({ fathom_url: v || null })} />
              {deal.fathom_url && (
                <Link href={deal.fathom_url} target="_blank" sx={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                  Open recording <OpenInNewIcon sx={{ fontSize: 14 }} />
                </Link>
              )}
              <Field label="Call summary" multiline value={deal.fathom_summary ?? ""} placeholder="Paste the Fathom summary" onSave={(v) => save.mutate({ fathom_summary: v || null })} />
            </Stack>
          </Box>

          {/* Next action */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink3, mb: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Next action
            </Typography>
            <Stack spacing={1.25}>
              <Field label="When" type="date" value={deal.next_action_at ? deal.next_action_at.slice(0, 10) : ""} onSave={(v) => save.mutate({ next_action_at: v ? new Date(v).toISOString() : null })} />
              <Field label="Why" value={deal.next_action_reason ?? ""} placeholder='e.g. "Circle back in December after notice period"' onSave={(v) => save.mutate({ next_action_reason: v || null })} />
            </Stack>
          </Box>

          {/* Commercials */}
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.ink3, mb: 1, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Deal
            </Typography>
            <Stack spacing={1.25}>
              <Field label="Pricing plan" value={deal.pricing_plan} onSave={(v) => save.mutate({ pricing_plan: v })} />
              {(deal.stage === "lost" || deal.stage === "churned") && (
                <Field label={deal.stage === "churned" ? "Why they left" : "Why it was lost"} value={deal.lost_reason ?? ""} placeholder="e.g. price, went with a competitor" onSave={(v) => save.mutate({ lost_reason: v || null })} />
              )}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Drawer>
  );
}
