import { Box, Button, Card, CardContent, Chip, Divider, Typography } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../hooks/useAuth";
import { useTier } from "../hooks/useTier";

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const { tier } = useTier();

  if (!user) return null;

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", mt: 4, px: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Account
      </Typography>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
            Phone number
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {user.phone || "Not set"}
          </Typography>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
            Plan
          </Typography>
          <Chip
            label={tier === "paid" ? "Paid" : "Free"}
            color={tier === "paid" ? "success" : "default"}
            size="small"
          />
        </CardContent>
      </Card>

      <Divider sx={{ mb: 3 }} />

      <Button
        variant="outlined"
        color="error"
        startIcon={<LogoutIcon />}
        onClick={signOut}
        fullWidth
      >
        Sign out
      </Button>
    </Box>
  );
}
