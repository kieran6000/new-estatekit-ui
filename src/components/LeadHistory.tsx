import { useState } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Box, Button, Skeleton, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import ComputerIcon from "@mui/icons-material/Computer";
import FacebookIcon from "@mui/icons-material/Facebook";
import HistoryIcon from "@mui/icons-material/History";
import LanguageIcon from "@mui/icons-material/Language";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import TabletAndroidIcon from "@mui/icons-material/TabletAndroid";
import TabletMacIcon from "@mui/icons-material/TabletMac";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import { tokens } from "../theme";
import { listAgentProfiles } from "../api/_client";
import { listLeadEvents, type LeadEvent } from "../api/leadEvents";
import { timeAgo } from "../lib/timeAgo";

// The "what happened" log for one lead, for agents and staff. Agents can't
// look up staff profiles, so anything EstateKit staff did reads "EstateKit
// team" for them. Each row: who did it (their
// photo/initials, or an icon when it was the system), what happened, and
// where from — including the device when we know it.

const PREVIEW_COUNT = 15;

const SOURCE_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  action_link: "WhatsApp link",
  automation: "Automation",
  facebook: "Facebook",
  website: "Website form",
  system: "System",
};

const SOURCE_ICON: Record<string, SvgIconComponent> = {
  automation: BoltIcon,
  action_link: WhatsAppIcon,
  facebook: FacebookIcon,
  website: LanguageIcon,
};

/** What the Conversions API outcome names mean, in the agent's words. */
const CAPI_WORDS: Record<string, string> = {
  Schedule: "booked",
  MandateSigned: "signed",
  Purchase: "commission paid",
  "Commission Received": "commission paid",
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
    case "email_sent":
      return "Confirmation email sent";
    case "email_failed":
      return "Confirmation email didn't send";
    case "email_delivered":
      return "Confirmation email delivered";
    case "email_delayed":
      return "Confirmation email delayed";
    case "email_bounced":
      return "Confirmation email bounced";
    case "email_complained":
      return "Confirmation email marked as spam";
    case "email_opened":
      return "Opened the confirmation email";
    case "email_clicked":
      return "Tapped WhatsApp in the email";
    case "plan_opened":
      // Newer rows name the lead magnet and where it was opened.
      if (e.from_value && e.to_value?.startsWith("Opened ") && !e.to_value.startsWith("Opened their selling plan")) return e.to_value;
      // from_value says where: the thank-you page or the email (older rows
      // have none; they all came from the email).
      return e.from_value === "thank_you" ? "Opened their marketing plan on the thank-you page"
        : e.from_value === "email" ? "Opened their marketing plan from the email"
        : "Opened their marketing plan";
    case "plan_pdf_opened":
      return "Opened the full marketing plan (PDF)";
    case "workflow_email":
      return `Email sent: ${e.to_value ?? ""}`;
    case "workflow_email_opened":
      return `Opened the email: ${e.to_value ?? ""}`;
    case "tagged":
      return `Tagged ${e.to_value ?? ""}`;
    case "email_unsubscribed":
      return "Unsubscribed from emails";
    case "capi_reported":
      return `Told Facebook: ${CAPI_WORDS[e.to_value ?? ""] ?? e.to_value ?? ""}`;
    default:
      return e.event_type;
  }
}

/** Rough device from a browser user agent — enough to say "iPhone" or "Windows". */
function deviceOf(ua: string | null): { label: string; Icon: SvgIconComponent } | null {
  if (!ua) return null;
  if (/iPhone/i.test(ua)) return { label: "iPhone", Icon: PhoneIphoneIcon };
  if (/iPad/i.test(ua)) return { label: "iPad", Icon: TabletMacIcon };
  if (/Android/i.test(ua)) {
    return /Mobile/i.test(ua) ? { label: "Android", Icon: PhoneAndroidIcon } : { label: "Android tablet", Icon: TabletAndroidIcon };
  }
  if (/Windows/i.test(ua)) return { label: "Windows", Icon: ComputerIcon };
  if (/Macintosh|Mac OS X/i.test(ua)) return { label: "Mac", Icon: ComputerIcon };
  if (/Linux|CrOS/i.test(ua)) return { label: "Computer", Icon: ComputerIcon };
  return null;
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function LeadHistory({ leadId }: { leadId: string }) {
  const [showAll, setShowAll] = useState(false);
  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["leadEvents", leadId],
    queryFn: () => listLeadEvents(leadId),
  });
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });

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
        const actor = e.actor_id ? profiles.find((p) => p.agent_id === e.actor_id) : undefined;
        const who = actor?.display_name ?? (e.actor_id ? "EstateKit team" : "");
        const device = deviceOf(e.device);
        // Backfilled rows carry a stand-in timestamp, so don't show a time for them.
        const when = e.source === "backfill" ? "" : timeAgo(e.created_at);
        const isPlan = e.event_type === "plan_opened" || e.event_type === "plan_pdf_opened";
        const isWorkflow = e.event_type === "workflow_email" || e.event_type === "workflow_email_opened" || e.event_type === "tagged";
        const isEmail = e.event_type.startsWith("email_") || e.event_type.startsWith("workflow_email") || (e.event_type === "plan_opened" && e.from_value !== "thank_you");
        // For sends, the detail line says what was sent / to whom, not "Automation".
        // Plan opens already say everything in the title.
        // Workflow rows name the workflow; the title already says what happened.
        const via = isWorkflow ? (e.event_type === "workflow_email_opened" ? "" : e.from_value ?? "") : isPlan ? "" : e.event_type === "whatsapp_sent" || isEmail ? e.to_value ?? "" : SOURCE_LABEL[e.source] ?? "";
        const SourceIcon = e.event_type === "capi_reported" ? FacebookIcon : e.event_type === "whatsapp_sent" ? WhatsAppIcon : isEmail ? MailOutlineIcon : isPlan ? LanguageIcon : SOURCE_ICON[e.source] ?? HistoryIcon;

        return (
          <Box
            key={e.id}
            title={e.source === "backfill" ? undefined : new Date(e.created_at).toLocaleString("en-ZA")}
            sx={{ display: "flex", gap: 1.25, p: "10px 16px", borderTop: `1px solid ${tokens.divider2}`, "&:first-of-type": { borderTop: 0 } }}
          >
            {actor ? (
              <Avatar
                src={actor.sidebar_logo_url ?? undefined}
                alt={who}
                sx={{ width: 28, height: 28, fontSize: 11.5, fontWeight: 600, bgcolor: tokens.primaryBg, color: tokens.primary, flex: "0 0 auto" }}
              >
                {initialsOf(who)}
              </Avatar>
            ) : (
              <Avatar sx={{ width: 28, height: 28, bgcolor: tokens.surface2, color: "text.secondary", flex: "0 0 auto" }}>
                <SourceIcon sx={{ fontSize: 16 }} />
              </Avatar>
            )}

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 14, color: ["email_failed", "email_bounced", "email_complained"].includes(e.event_type) ? "error.main" : undefined }}>{describe(e)}</Typography>
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
              <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.75, mt: 0.25, color: "text.secondary" }}>
                {[who, via].filter(Boolean).map((part) => (
                  <Typography key={part} sx={{ fontSize: 12.5, "&:not(:first-of-type)::before": { content: '"· "' } }}>
                    {part}
                  </Typography>
                ))}
                {device && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                    <Typography sx={{ fontSize: 12.5 }}>·</Typography>
                    <device.Icon sx={{ fontSize: 14 }} />
                    <Typography sx={{ fontSize: 12.5 }}>{device.label}</Typography>
                  </Box>
                )}
                {when && <Typography sx={{ fontSize: 12.5 }}>· {when}</Typography>}
              </Box>
            </Box>
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
