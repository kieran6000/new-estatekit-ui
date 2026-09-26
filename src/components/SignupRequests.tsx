import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { tokens } from "../theme";
import { listSignupRequests, setSignupStatus, type SignupRequest, type SignupStatus } from "../api/signup";
import { useAuth } from "../hooks/useAuth";
import { useSnack } from "../hooks/useSnack";
import { timeAgo } from "../lib/timeAgo";

/** New free-account requests from /start, shown above the Clients table.
 *  Hidden entirely when there are none. */
export default function SignupRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: requests = [] } = useQuery({ queryKey: ["signupRequests"], queryFn: listSignupRequests, staleTime: 60_000 });

  if (!requests.length) return null;

  async function mark(r: SignupRequest, status: SignupStatus, done: string) {
    try {
      await setSignupStatus(r.id, status, user!.id);
      await qc.invalidateQueries({ queryKey: ["signupRequests"] });
      showSnack(done);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't update that. Try again.");
    }
  }

  const fresh = requests.filter((r) => r.status === "new").length;

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: { md: "8px" }, mb: 2, overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, display: "flex", alignItems: "baseline", gap: 1, borderBottom: `1px solid ${tokens.divider2}` }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2 }}>
          Sign-up requests
        </Typography>
        <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>
          {fresh ? `${fresh} new` : "all contacted"} · from the "Powered by EstateKit" link
        </Typography>
      </Box>
      {requests.map((r) => {
        const text = `Hi ${r.name.split(" ")[0]}, it's Kieran from EstateKit. Thanks for requesting an account. Got 10 minutes for a quick call today to get you set up?`;
        return (
          <Box
            key={r.id}
            sx={{ px: 2, py: 1.5, display: "flex", gap: 1.5, alignItems: { xs: "flex-start", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, "& + &": { borderTop: `1px solid ${tokens.divider2}` } }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                {r.name}
                <Box component="span" sx={{ fontWeight: 400, color: tokens.ink2 }}>{r.agency ? ` · ${r.agency}` : ""}</Box>
                {r.status === "new" && (
                  <Box component="span" sx={{ ml: 1, fontSize: 11, fontWeight: 600, color: tokens.primary }}>NEW</Box>
                )}
              </Typography>
              <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 0.25 }}>
                {[r.wants.join(", "), [r.city, r.suburbs].filter(Boolean).join(": "), r.budget && `Budget ${r.budget}`].filter(Boolean).join(" · ")}
              </Typography>
              <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 0.25 }}>
                {[r.whatsapp, r.email].filter(Boolean).join(" · ")} · {timeAgo(r.created_at)}
                {r.ref ? ` · via /p/${r.ref}` : ""}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexShrink: 0 }}>
              <Tooltip title="WhatsApp them">
                <IconButton
                  href={`https://wa.me/${r.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noopener"
                  onClick={() => r.status === "new" && mark(r, "contacted", "Marked as contacted")}
                  sx={{ border: `1px solid ${tokens.divider}` }}
                >
                  <WhatsAppIcon sx={{ fontSize: 20, color: "#1e8e3e" }} />
                </IconButton>
              </Tooltip>
              <Button size="small" variant="outlined" onClick={() => mark(r, "signed_up", "Marked as signed up")}>Signed up</Button>
              <Button size="small" onClick={() => mark(r, "not_a_fit", "Removed from the list")} sx={{ color: tokens.ink2 }}>Not a fit</Button>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
