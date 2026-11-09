import { useState } from "react";
import { Box, ButtonBase, Drawer, Tooltip, Typography } from "@mui/material";
import { supabase } from "../api/_client";
import { useSnack } from "../hooks/useSnack";
import { stageCounts } from "../lib/leadFunnel";
import { timeAgo } from "../lib/timeAgo";
import LeadDetailPage from "../pages/LeadDetailPage";
import { tokens } from "../theme";

/** The same colours as the stage chips on a lead. */
const STAGE_COLOR: Record<string, string> = {
  "New Lead": tokens.green,
  "No Answer": tokens.amber,
  Contacted: tokens.primary,
  Booked: tokens.purple,
  "Viewing Booked": tokens.purple,
  "Offer Made": tokens.greenDark,
  "Mandate Signed": tokens.greenDark,
  Bought: tokens.greenDark,
  Lost: tokens.ink3,
  "Invalid Number": tokens.ink3,
};
const colorOf = (stage: string) => STAGE_COLOR[stage] ?? tokens.ink3;

/** Their leads in a stage (or all of them), newest first. */
async function leadIds(agentId: string, stage: string | null): Promise<string[]> {
  let q = supabase.from("leads").select("id").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(1000);
  if (stage) q = q.eq("stage", stage);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((l) => l.id as string);
}

const tap = { borderRadius: "6px", px: 0.75, py: 0.25, mx: -0.75, textAlign: "left", "&:hover": { bgcolor: tokens.surface2 }, "&:hover .ek-name": { textDecoration: "underline" } } as const;

/** Where their leads are right now, by the pipeline's own stage names, on one
 *  slim row. Tap a stage (or its bit of the bar) and its leads open on the
 *  side, one at a time, to step through. */
export default function LeadFunnel({ agentId, byStage, lastLeadAt, hasAdAccount = true }: { agentId: string; byStage: Record<string, number>; lastLeadAt?: string | null; hasAdAccount?: boolean }) {
  const { total, stages } = stageCounts(byStage);
  const showSnack = useSnack();
  const [panel, setPanel] = useState<{ ids: string[]; i: number } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  async function open(stage: string | null) {
    setOpening(stage ?? "all");
    try {
      const ids = await leadIds(agentId, stage);
      if (ids.length) setPanel({ ids, i: 0 });
      else showSnack("No leads there right now.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't open these leads. Try again.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", px: 2, py: 1.5, minWidth: 0 }}>
      {!total ? (
        <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{hasAdAccount ? "No leads yet. Leads from their Facebook ads show here within about 5 minutes of coming in." : "No leads yet. Once their ad account is linked above and their ads run, leads show here."}</Typography>
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", columnGap: 3, rowGap: 1 }}>
            <ButtonBase onClick={() => void open(null)} disabled={!!opening} aria-label="Open all their leads" sx={{ ...tap, display: "block" }}>
              <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{total}</Typography>
              <Typography className="ek-name" sx={{ fontSize: 13, color: tokens.ink2 }}>{opening === "all" ? "Opening…" : "leads"}</Typography>
            </ButtonBase>
            {stages.map((s) => (
              <ButtonBase key={s.stage} onClick={() => void open(s.stage)} disabled={!!opening} aria-label={`Open their ${s.stage} leads`} sx={{ ...tap, display: "block" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{s.count}</Typography>
                <Typography className="ek-name" sx={{ fontSize: 13, color: tokens.ink2, display: "flex", alignItems: "center", gap: 0.6, whiteSpace: "nowrap" }}>
                  <Box component="span" sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: colorOf(s.stage), flex: "none" }} />
                  {opening === s.stage ? "Opening…" : s.stage}
                </Typography>
              </ButtonBase>
            ))}
            <Typography sx={{ fontSize: 12, color: tokens.ink3, ml: "auto", alignSelf: "flex-end" }}>All time{lastLeadAt ? ` · last lead ${timeAgo(lastLeadAt)}` : ""}</Typography>
          </Box>
          {/* One bar: how their leads split across the stages. Each bit opens its leads. */}
          <Box sx={{ display: "flex", gap: "2px", height: 10, mt: 1.25, borderRadius: "5px", overflow: "hidden" }}>
            {stages.map((s) => (
              <Tooltip key={s.stage} title={`${s.stage}: ${s.count} of ${total}. Click to open them`}>
                <ButtonBase onClick={() => void open(s.stage)} disabled={!!opening} aria-label={`Open their ${s.stage} leads`}
                  sx={{ flex: `${s.count} 1 0`, minWidth: 3, bgcolor: colorOf(s.stage), borderRadius: 0, transition: "filter .12s", "&:hover": { filter: "brightness(1.15)" } }} />
              </Tooltip>
            ))}
          </Box>
        </>
      )}

      {/* The same side panel as an ad's results: one lead at a time, ‹ › to step through. */}
      <Drawer
        anchor="right"
        open={!!panel}
        onClose={() => setPanel(null)}
        slotProps={{ paper: { sx: { width: { xs: "100%", sm: 480 }, bgcolor: "background.default" } } }}
      >
        {panel && (
          <LeadDetailPage
            key={panel.ids[panel.i]}
            leadId={panel.ids[panel.i]}
            onClose={() => setPanel(null)}
            nav={{
              label: `${panel.i + 1} of ${panel.ids.length}`,
              prev: panel.i > 0 ? () => setPanel({ ...panel, i: panel.i - 1 }) : undefined,
              next: panel.i < panel.ids.length - 1 ? () => setPanel({ ...panel, i: panel.i + 1 }) : undefined,
            }}
          />
        )}
      </Drawer>
    </Box>
  );
}
