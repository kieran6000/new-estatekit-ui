import { useEffect, useState } from "react";
import { Box, Button, Link, Paper, Stack, TextField, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tokens } from "../theme";
import { AgencyDealsNotSetUp, getAgencyDealByLead, saveAgencyDealForLead, type AgencyDeal, type AgencyDealPatch } from "../api/agencyDeals";

// The one extra bit the "EstateKit Agents" (our own sales) pipeline needs,
// shown right on the lead in the normal Leads detail — not a separate screen.
// Looks like every other section on the page: a titled Paper with rows, and
// an Edit button that flips to inline fields. Empty rows are hidden, so a lead
// nobody has filled in stays as clean as any other.

/** A read row, same look as the lead detail's own Section rows. */
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", p: "10px 16px", borderTop: `1px solid ${tokens.divider2}`, gap: 1.5, "&:first-of-type": { borderTop: 0 } }}>
      <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>{k}</Typography>
      <Typography sx={{ fontSize: 14, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{v}</Typography>
    </Box>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

type Draft = {
  leads_per_month: string;
  deals_per_month: string;
  tried_before: string;
  tried_before_cost: string;
  budget: string;
  target_suburbs: string;
  decision_date: string;
  fathom_url: string;
  fathom_summary: string;
  next_action_at: string;
  next_action_reason: string;
  scorecard_notes: string;
};

function toDraft(d: AgencyDeal | null): Draft {
  return {
    leads_per_month: d?.leads_per_month?.toString() ?? "",
    deals_per_month: d?.deals_per_month?.toString() ?? "",
    tried_before: d?.tried_before ?? "",
    tried_before_cost: d?.tried_before_cost ?? "",
    budget: d?.budget ?? "",
    target_suburbs: d?.target_suburbs ?? "",
    decision_date: d?.decision_date ?? "",
    fathom_url: d?.fathom_url ?? "",
    fathom_summary: d?.fathom_summary ?? "",
    next_action_at: d?.next_action_at ? d.next_action_at.slice(0, 10) : "",
    next_action_reason: d?.next_action_reason ?? "",
    scorecard_notes: d?.scorecard_notes ?? "",
  };
}

function toPatch(dr: Draft): AgencyDealPatch {
  const num = (s: string) => (s.trim() ? Number(s) : null);
  const str = (s: string) => (s.trim() ? s.trim() : null);
  return {
    leads_per_month: num(dr.leads_per_month),
    deals_per_month: num(dr.deals_per_month),
    tried_before: str(dr.tried_before),
    tried_before_cost: str(dr.tried_before_cost),
    budget: str(dr.budget),
    target_suburbs: str(dr.target_suburbs),
    decision_date: str(dr.decision_date),
    fathom_url: str(dr.fathom_url),
    fathom_summary: str(dr.fathom_summary),
    next_action_at: dr.next_action_at.trim() ? new Date(dr.next_action_at).toISOString() : null,
    next_action_reason: str(dr.next_action_reason),
    scorecard_notes: str(dr.scorecard_notes),
  };
}

export default function AgencyDealSection({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft(null));

  const { data: deal, error } = useQuery({
    queryKey: ["agencyDeal", leadId],
    queryFn: () => getAgencyDealByLead(leadId),
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!editing) setDraft(toDraft(deal ?? null));
  }, [deal, editing]);

  const save = useMutation({
    mutationFn: () => saveAgencyDealForLead(leadId, deal?.id ?? null, toPatch(draft)),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["agencyDeal", leadId] });
    },
  });

  // Table not created yet, or some other load error: show nothing rather than
  // breaking the lead page.
  if (error instanceof AgencyDealsNotSetUp || (error && !deal)) return null;

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const rows: { k: string; v: React.ReactNode }[] = [];
  if (deal?.deals_per_month != null || deal?.leads_per_month != null) {
    rows.push({ k: "Now doing", v: `${deal.deals_per_month ?? "?"} deals / ${deal.leads_per_month ?? "?"} leads a month` });
  }
  if (deal?.tried_before) rows.push({ k: "Tried before", v: deal.tried_before + (deal.tried_before_cost ? ` (${deal.tried_before_cost})` : "") });
  if (deal?.budget) rows.push({ k: "Budget", v: deal.budget });
  if (deal?.target_suburbs) rows.push({ k: "Suburbs", v: deal.target_suburbs });
  if (deal?.decision_date) rows.push({ k: "Deciding", v: fmtDate(deal.decision_date) });
  if (deal?.next_action_reason || deal?.next_action_at) {
    rows.push({ k: "Next", v: `${deal.next_action_reason ?? ""}${deal.next_action_at ? ` · ${fmtDate(deal.next_action_at)}` : ""}` });
  }
  if (deal?.fathom_url) {
    rows.push({
      k: "Call",
      v: (
        <Link href={deal.fathom_url} target="_blank" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          Fathom recording <OpenInNewIcon sx={{ fontSize: 14 }} />
        </Link>
      ),
    });
  }
  if (deal?.fathom_summary) rows.push({ k: "Summary", v: deal.fathom_summary });
  if (deal?.scorecard_notes) rows.push({ k: "Notes", v: deal.scorecard_notes });

  return (
    <Paper variant="outlined" sx={{ mt: 1.5, mx: 2, borderRadius: "6px" }}>
      <Box sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "14px 16px 4px" }}>
          Discovery
        </Typography>
        {!editing && (
          <Box sx={{ pt: 1 }}>
            <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>Edit</Button>
          </Box>
        )}
      </Box>

      {!editing && rows.length > 0 && rows.map((r, i) => <Row key={i} k={r.k} v={r.v} />)}
      {!editing && rows.length === 0 && (
        <Typography sx={{ fontSize: 13.5, color: "text.secondary", p: "4px 16px 16px" }}>
          Nothing captured from the call yet.
        </Typography>
      )}

      {editing && (
        <Box sx={{ p: "4px 16px 16px" }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1}>
              <TextField label="Leads / month" type="number" size="small" fullWidth value={draft.leads_per_month} onChange={set("leads_per_month")} />
              <TextField label="Deals / month" type="number" size="small" fullWidth value={draft.deals_per_month} onChange={set("deals_per_month")} />
            </Stack>
            <TextField label="Tried before" size="small" fullWidth value={draft.tried_before} onChange={set("tried_before")} placeholder="e.g. Property24, a Fiverr freelancer" />
            <TextField label="What it cost them" size="small" fullWidth value={draft.tried_before_cost} onChange={set("tried_before_cost")} placeholder="e.g. R2,000, no results" />
            <Stack direction="row" spacing={1}>
              <TextField label="Budget" size="small" fullWidth value={draft.budget} onChange={set("budget")} placeholder="e.g. R70/day" />
              <TextField label="Decision date" type="date" size="small" fullWidth value={draft.decision_date} onChange={set("decision_date")} slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            <TextField label="Target suburbs" size="small" fullWidth value={draft.target_suburbs} onChange={set("target_suburbs")} />
            <TextField label="Fathom link" size="small" fullWidth value={draft.fathom_url} onChange={set("fathom_url")} placeholder="https://fathom.video/calls/…" />
            <TextField label="Call summary" size="small" fullWidth multiline minRows={2} value={draft.fathom_summary} onChange={set("fathom_summary")} />
            <Stack direction="row" spacing={1}>
              <TextField label="Next action" type="date" size="small" fullWidth value={draft.next_action_at} onChange={set("next_action_at")} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Why" size="small" fullWidth value={draft.next_action_reason} onChange={set("next_action_reason")} placeholder='e.g. "Circle back after notice ends"' />
            </Stack>
            <TextField label="Notes" size="small" fullWidth multiline minRows={2} value={draft.scorecard_notes} onChange={set("scorecard_notes")} />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button size="small" onClick={() => { setEditing(false); setDraft(toDraft(deal ?? null)); }}>Cancel</Button>
              <Button size="small" variant="contained" disableElevation onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
