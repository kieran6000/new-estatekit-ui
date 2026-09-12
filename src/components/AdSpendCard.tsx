import { Box, Skeleton, Typography } from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { tokens } from "../theme";
import type { AgentProfile, FbAdAccount } from "../api/agentProfile";

const money = (v: number, currency: string) =>
  `${currency === "ZAR" ? "R" : currency + " "}${v.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

/** Compact ad-billing summary for Overview. Spend is whatever the caller
 *  passes in (the same period-scoped total the KPI table shows) — balance and
 *  billing method are live account facts, not time-ranged. */
export default function AdSpendCard({
  profile,
  adAccount,
  periodSpend,
  isLoading,
}: {
  profile: AgentProfile;
  adAccount: FbAdAccount | undefined;
  periodSpend: number;
  isLoading: boolean;
}) {
  if (!profile.fbAdAccountId) {
    return (
      <Box sx={{ p: "8px 12px", bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px" }}>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          No Ad Account ID set for this client — add one in Facebook settings to see ad spend here.
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return <Skeleton variant="rounded" height={56} sx={{ borderRadius: "8px" }} />;
  }

  if (adAccount?.note) {
    return (
      <Box sx={{ p: "8px 12px", bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px" }}>
        <Typography sx={{ fontSize: 12.5, color: "warning.main" }}>
          Can't read this ad account from Meta — the owner needs to grant ads_read access.
        </Typography>
      </Box>
    );
  }

  const currency = adAccount?.currency ?? "ZAR";
  const isCard = profile.billingType === "card";

  return (
    <Box
      sx={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2.5,
        p: "10px 14px", bgcolor: "background.paper",
        border: `1px solid ${tokens.divider}`, borderRadius: "8px",
      }}
    >
      <Box>
        <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Spend this period
        </Typography>
        <Typography sx={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {money(periodSpend, currency)}
        </Typography>
      </Box>

      <Box>
        <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Current balance
        </Typography>
        <Typography sx={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {adAccount?.balance != null ? money(adAccount.balance, currency) : "—"}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}>
        {isCard ? <CreditCardIcon sx={{ fontSize: 18, color: tokens.primary }} /> : <AccountBalanceWalletIcon sx={{ fontSize: 18, color: "#e65100" }} />}
        <Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
            {isCard ? (adAccount?.fundingLabel || "Card") : "Prepaid / added funds"}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            {isCard ? "Billed to card" : "Balance topped up manually"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
