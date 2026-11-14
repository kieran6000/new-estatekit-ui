import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Box, CircularProgress, Typography } from "@mui/material";
import { supabase } from "../api/_client";
import { ThankYouCallTime } from "../components/ThankYouExtras";
import BrandLogo from "../components/BrandLogo";
import { readableOn } from "../lib/contrast";

// /call/<code>: a lead picks a day and time for a call, from a link in an
// email or WhatsApp ({{call_link}}). The same picker as the thank-you page,
// saved the same way (set_call_time), so the agent hears about it the same
// way too. The code is the lead's private code.
//
// /call/sample/<agent id>: the same page with the agent's real branding and a
// made-up lead, opened from the Automations editor ("See what the lead sees")
// so the team can see it. Logged in only (the agent or an operator); nothing
// is saved from it.

export interface Booking {
  lead_name: string;
  agent_name: string;
  photo: string | null;
  logo: string | null;
  accent: string;
  question: string | null;
  no_weekends: boolean;
  call_time: string | null;
}

/** The sample: the account's real branding (its newest form wins, like the
 *  real page), a made-up lead and no time picked yet. */
async function getSampleBooking(agentId: string): Promise<Booking | null> {
  const [{ data: a }, { data: pg }] = await Promise.all([
    supabase.from("agent_profiles").select("display_name, avatar_url, sidebar_color, sidebar_logo_url").eq("agent_id", agentId).maybeSingle(),
    supabase.from("lead_pages").select("accent_color, logo_data_url, profile_photo_data_url, thank_you_call_question, thank_you_weekend_off")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!a) return null;
  return {
    lead_name: "Sam",
    agent_name: a.display_name ?? "",
    photo: pg?.profile_photo_data_url || a.avatar_url || null,
    logo: pg?.logo_data_url || a.sidebar_logo_url || null,
    accent: pg?.accent_color || a.sidebar_color || "#1976d2",
    question: pg?.thank_you_call_question?.trim() || null,
    no_weekends: !!pg?.thank_you_weekend_off,
    call_time: null,
  };
}

export default function CallBookingPage() {
  const { token = "", agentId = "" } = useParams();
  const sample = !!agentId;
  const { data, isLoading } = useQuery({
    queryKey: sample ? ["callBookingSample", agentId] : ["callBooking", token],
    queryFn: async () => {
      if (sample) return getSampleBooking(agentId);
      const { data, error } = await supabase.rpc("get_call_booking", { p_token: token });
      if (error) throw error;
      return (data ?? null) as Booking | null;
    },
    retry: 1,
  });
  const agentFirst = (data?.agent_name || "").trim().split(/\s+/)[0];
  useEffect(() => {
    document.title = agentFirst ? `Pick a time to talk to ${agentFirst}` : "Pick a time for a call";
  }, [agentFirst]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f1f3f4", display: "flex", flexDirection: "column", alignItems: "center", px: 2, py: { xs: 3, sm: 6 } }}>
      {sample && data && (
        <Typography sx={{ width: "100%", maxWidth: 440, fontSize: 13.5, mb: 2, p: "10px 14px", borderRadius: "8px", bgcolor: "#fff8e1", border: "1px solid #ffe082" }}>
          <b>Sample:</b> what a lead sees when they tap the book-a-call link. Your real branding, a made-up lead. Nothing is saved from here.
        </Typography>
      )}
      {isLoading ? (
        <CircularProgress sx={{ mt: 8 }} />
      ) : !data ? (
        <Box sx={{ width: "100%", maxWidth: 440, bgcolor: "#fff", borderRadius: "14px", p: 3, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <Typography sx={{ fontSize: 19, fontWeight: 700 }}>{sample ? "Log in to see the sample" : "This link doesn't work any more"}</Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
            {sample
              ? "Log in to EstateKit first, then open it again from Automations."
              : "Please reply to the email it came in, or call your agent directly, and they'll find a time with you."}
          </Typography>
        </Box>
      ) : (
        <CallBookingView data={data} token={token} preview={sample} />
      )}
    </Box>
  );
}

/** The page itself, once we know who it is for. `preview`: nothing is saved. */
export function CallBookingView({ data, token, preview }: { data: Booking; token: string; preview?: boolean }) {
  const agentFirst = (data.agent_name || "").trim().split(/\s+/)[0];
  return (
    <>
      {data.logo && (
        <Box sx={{ width: "100%", maxWidth: 440, bgcolor: data.accent, color: readableOn(data.accent), borderRadius: "10px", p: "12px 20px", mb: 2, display: "flex", justifyContent: "center" }}>
          <BrandLogo src={data.logo} size={44} onColor={data.accent} />
        </Box>
      )}
      <Box sx={{ width: "100%", maxWidth: 440, bgcolor: "#fff", borderRadius: "14px", p: { xs: 2.5, sm: 3.5 }, boxShadow: "0 1px 3px rgba(0,0,0,.08)", textAlign: "center" }}>
        <Avatar src={data.photo ?? undefined} sx={{ width: 84, height: 84, mx: "auto", mb: 1.5, fontSize: 32, fontWeight: 700, bgcolor: data.accent, color: readableOn(data.accent), border: "3px solid #fff", boxShadow: "0 2px 10px rgba(0,0,0,.12)" }}>
          {agentFirst[0]?.toUpperCase()}
        </Avatar>
        <Typography sx={{ fontSize: 21, fontWeight: 700, lineHeight: 1.3 }}>
          {data.lead_name ? `Hi ${data.lead_name}, let's find a time to talk` : "Let's find a time to talk"}
        </Typography>
        <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
          {agentFirst || "Your agent"} will call you at the time you pick. It takes about 10 minutes, with no obligation.
        </Typography>
        {data.call_time && (
          <Typography sx={{ fontSize: 14, mt: 2, p: 1.25, borderRadius: "8px", bgcolor: "#f1f3f4" }}>
            You picked <b>{data.call_time}</b>. Pick a new time below if that's changed.
          </Typography>
        )}
        <ThankYouCallTime
          token={token}
          accent={data.accent}
          agentName={data.agent_name}
          question={data.question}
          noWeekends={data.no_weekends}
          preview={preview}
        />
      </Box>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 2 }}>Powered by EstateKit</Typography>
    </>
  );
}
