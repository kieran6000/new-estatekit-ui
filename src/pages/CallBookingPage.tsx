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

export default function CallBookingPage() {
  const { token = "" } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["callBooking", token],
    queryFn: async () => {
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
      {isLoading ? (
        <CircularProgress sx={{ mt: 8 }} />
      ) : !data ? (
        <Box sx={{ width: "100%", maxWidth: 440, bgcolor: "#fff", borderRadius: "14px", p: 3, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <Typography sx={{ fontSize: 19, fontWeight: 700 }}>This link doesn't work any more</Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
            Please reply to the email it came in, or call your agent directly, and they'll find a time with you.
          </Typography>
        </Box>
      ) : (
        <CallBookingView data={data} token={token} />
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
