import { Box, Button, Paper, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PauseCircleOutlinedIcon from "@mui/icons-material/PauseCircleOutlined";
import { useAuth } from "../hooks/useAuth";
import { ADMIN_WHATSAPP } from "../lib/contact";
import EstateKitLogo from "../components/EstateKitLogo";
import { tokens } from "../theme";

// What a deactivated client sees instead of the dashboard (if they were still
// signed in when staff deactivated them; new sign-ins are blocked outright).
// Their leads and pages are safe; they just need to talk to us.

const MESSAGE = "Hi EstateKit, my dashboard says my account is paused. Can you help me turn it back on?";

export default function AccountPausedPage() {
  const { signOut } = useAuth();
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", p: 2.5, bgcolor: "background.default" }}>
      <Paper variant="outlined" sx={{ maxWidth: 400, width: "100%", p: 3, borderRadius: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
        <EstateKitLogo sx={{ height: 26, alignSelf: "flex-start" }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <PauseCircleOutlinedIcon sx={{ color: tokens.amber, fontSize: 30 }} />
          <Typography sx={{ fontSize: 20, fontWeight: 500 }}>Your account is paused</Typography>
        </Box>
        <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
          Your leads and pages are safe. Message us on WhatsApp and we'll turn your dashboard back on.
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<WhatsAppIcon />}
          href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(MESSAGE)}`}
          target="_blank"
          rel="noopener"
          sx={{ bgcolor: tokens.greenCall, color: "#fff", "&:hover": { bgcolor: tokens.greenCallHover } }}
        >
          Message EstateKit
        </Button>
        <Button onClick={() => void signOut()} sx={{ alignSelf: "center" }}>Sign out</Button>
      </Paper>
    </Box>
  );
}
