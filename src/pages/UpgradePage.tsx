import { useNavigate } from "react-router-dom";
import { AppBar, Box, IconButton, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { tokens } from "../theme";

const ROWS: [string, boolean, boolean][] = [
  ["Exclusive leads (never shared)", true, true],
  ["Uncapped leads per month", false, true],
  ["Done-for-you ad management", false, true],
  ["Full course library", false, true],
  ["Custom form questions", false, true],
];

export default function UpgradePage() {
  const navigate = useNavigate();
  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate(-1)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Upgrade</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 640, mx: "auto", pb: 4 }}>
      <Box sx={{ p: "20px 16px 4px", textAlign: "center" }}>
        <Typography sx={{ fontSize: 20, fontWeight: 500 }}>Get more from EstateKit</Typography>
        <Typography sx={{ color: "text.secondary", fontSize: 14, mt: 0.5 }}>
          Paid agents get exclusive leads, no caps, and the full course.
        </Typography>
      </Box>

      <Box sx={{ m: "16px 16px 0", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", bgcolor: "background.paper" }}>
        <Box sx={{ display: "flex", borderBottom: `1px solid ${tokens.divider}` }}>
          <Box sx={{ flex: 1, p: "12px 16px" }} />
          <Box sx={{ flex: "0 0 90px", p: "12px 8px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>Free</Box>
          <Box sx={{ flex: "0 0 90px", p: "12px 8px", textAlign: "center", fontSize: 12, fontWeight: 600, color: tokens.primaryDark, textTransform: "uppercase", bgcolor: tokens.primaryBg }}>Paid</Box>
        </Box>
        {ROWS.map(([label, free, paid], i) => (
          <Box key={label} sx={{ display: "flex", alignItems: "center", borderBottom: i < ROWS.length - 1 ? `1px solid ${tokens.divider2}` : 0 }}>
            <Box sx={{ flex: 1, p: "12px 16px", fontSize: 14 }}>{label}</Box>
            <Box sx={{ flex: "0 0 90px", p: "12px 8px", textAlign: "center" }}>
              {free ? <CheckIcon sx={{ color: tokens.green, fontSize: 20 }} /> : <CloseIcon sx={{ color: "text.disabled", fontSize: 20 }} />}
            </Box>
            <Box sx={{ flex: "0 0 90px", p: "12px 8px", textAlign: "center", bgcolor: tokens.primaryBg }}>
              {paid ? <CheckIcon sx={{ color: tokens.green, fontSize: 20 }} /> : <CloseIcon sx={{ color: "text.disabled", fontSize: 20 }} />}
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ p: "20px 16px 0" }}>
        <Box
          component="a"
          href="https://whop.com/estatekit-1a6c/estatekit-seller-attraction-system"
          target="_blank"
          rel="noopener"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            bgcolor: tokens.primary,
            color: "#fff",
            borderRadius: "4px",
            p: "14px",
            fontWeight: 500,
            fontSize: 14,
            textTransform: "uppercase",
            textDecoration: "none",
            "&:hover": { bgcolor: tokens.primaryDark },
          }}
        >
          <StorefrontIcon fontSize="small" /> Hire the agency
        </Box>
      </Box>
      </Box>
    </Box>
  );
}
