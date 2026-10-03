import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { supabase } from "../api/_client";
import { tokens } from "../theme";

// The unsubscribe link at the bottom of workflow emails. Posts the signed link
// to email-unsubscribe once; the lead gets no more workflow emails.
export default function UnsubscribePage() {
  const { leadId = "", sig = "" } = useParams();
  const [state, setState] = useState<"working" | "done" | "bad">("working");

  useEffect(() => {
    let live = true;
    supabase.functions
      .invoke("email-unsubscribe", { body: { l: leadId, s: sig } })
      .then(({ data, error }) => { if (live) setState(!error && data?.ok ? "done" : "bad"); })
      .catch(() => { if (live) setState("bad"); });
    return () => { live = false; };
  }, [leadId, sig]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: tokens.bg, p: 3 }}>
      <Box sx={{ textAlign: "center", maxWidth: 420 }}>
        {state === "working" ? (
          <CircularProgress />
        ) : state === "done" ? (
          <>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: tokens.green, mb: 2 }} />
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 1 }}>You're unsubscribed</Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary", lineHeight: 1.6 }}>
              You won't get any more of these emails. If you still want help with your property, reply to any email you got and the agent will see it.
            </Typography>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 1 }}>This link doesn't work</Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary", lineHeight: 1.6 }}>
              It may be incomplete. Reply to the email and ask to be taken off, and the agent will do it.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
