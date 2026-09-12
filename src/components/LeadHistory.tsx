import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { tokens } from "../theme";
import { listAgentProfiles } from "../api/_client";
import { listLeadEvents, type LeadEvent } from "../api/leadEvents";
import { timeAgo } from "../lib/timeAgo";

// Admin-only "what happened" log for one lead. Rows use the same layout as the
// rest of the lead page (plain lines, thin dividers) — no timeline chrome.

const PREVIEW_COUNT = 15;

const SOURCE_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  action_link: "WhatsApp link",
  automation: "Automation",
  facebook: "Facebook",
  website: "Website form",
  system: "System",
};

function describe(e: LeadEvent): string {
  switch (e.event_type) {
    case "created":
      if (e.source === "facebook") return "Lead came in from Facebook";
      if (e.source === "website") return "Lead came in from the website form";
      return "Lead added";
    case "stage_changed":
      if (e.source === "backfill") return `Was at ${e.to_value} when history started`;
      return e.from_value ? `${e.from_value} → ${e.to_value}` : `Stage set to ${e.to_value}`;
    case "note_changed":
      return e.to_value ? "Note updated" : "Note cleared";
    case "archived":
      return "Archived";
    case "restored":
      return "Restored from archive";
    case "pipeline_moved":
      return `Moved from ${e.from_value ?? "—"} to ${e.to_value ?? "—"} pipeline`;
    case "call":
      return "Tapped Call";
    case "whatsapp_sent":
      return "WhatsApp reminder sent";
    default:
      return e.event_type;
  }
}

export default function LeadHistory({ leadId }: { leadId: string }) {
  const [showAll, setShowAll] = useState(false);
  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["leadEvents", leadId],
    queryFn: () => listLeadEvents(leadId),
  });
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });

  const nameOf = (id: string | null) => {
    if (!id) return "";
    return profiles.find((p) => p.agent_id === id)?.display_name ?? "";
  };

  if (isLoading) {
    return (
      <Box sx={{ p: "10px 16px 14px" }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="text" animation="wave" height={36} />
        ))}
      </Box>
    );
  }

  if (isError) {
    return (
      <Typography sx={{ fontSize: 13, color: "text.secondary", p: "10px 16px 14px" }}>
        Couldn't load history.
      </Typography>
    );
  }

  if (events.length === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: "text.secondary", p: "10px 16px 14px" }}>
        Nothing recorded yet.
      </Typography>
    );
  }

  const visible = showAll ? events : events.slice(0, PREVIEW_COUNT);

  return (
    <Box sx={{ pb: 0.5 }}>
      {visible.map((e) => {
        // Backfilled rows carry a stand-in timestamp, so don't show a time for them.
        const when = e.source === "backfill" ? "" : timeAgo(e.created_at);
        const who = nameOf(e.actor_id);
        const via = e.event_type === "whatsapp_sent" ? e.to_value ?? "" : SOURCE_LABEL[e.source] ?? "";
        const meta = [who, via, when].filter(Boolean).join(" · ");
        return (
          <Box
            key={e.id}
            title={e.source === "backfill" ? undefined : new Date(e.created_at).toLocaleString("en-ZA")}
            sx={{ p: "10px 16px", borderTop: `1px solid ${tokens.divider2}`, "&:first-of-type": { borderTop: 0 } }}
          >
            <Typography sx={{ fontSize: 14 }}>{describe(e)}</Typography>
            {e.event_type === "note_changed" && e.to_value && (
              <Typography
                sx={{
                  fontSize: 13, color: "text.secondary", whiteSpace: "pre-line", mt: 0.25,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}
              >
                {e.to_value}
              </Typography>
            )}
            {meta && <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>{meta}</Typography>}
          </Box>
        );
      })}
      {events.length > PREVIEW_COUNT && (
        <Box sx={{ px: 1, pb: 1 }}>
          <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ textTransform: "none" }}>
            {showAll ? "Show less" : `Show all ${events.length}`}
          </Button>
        </Box>
      )}
    </Box>
  );
}
