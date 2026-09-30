import { Box, Tooltip, Typography } from "@mui/material";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import TollOutlinedIcon from "@mui/icons-material/TollOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import { fundingKind } from "../api/clients";

const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

// Meta's ad account statuses worth mentioning (1 = active is left out).
const STATUS: Record<number, string> = {
  2: "Disabled",
  3: "Unpaid bill",
  7: "Under review",
  8: "Payment pending",
  9: "Grace period",
  100: "Closing",
  101: "Closed",
};

/** How an ad account pays Facebook: coins for money added up front
 *  (prepaid), a card for a card. Orange only when there's a real payment
 *  problem (see hasPaymentProblem). Hover for the details and balance. */
export default function FundingChip({
  type,
  label,
  balance,
  problem,
  status,
  showLabel,
}: {
  type: string | null | undefined;
  label?: string | null;
  balance?: number | null;
  problem?: boolean;
  status?: number | null;
  /** Also show "Card" / "Prepaid funds" next to the icon. */
  showLabel?: boolean;
}) {
  const kind = fundingKind(type);
  if (!kind) return null;
  const name = kind === "Prepaid" ? "Prepaid funds" : kind;
  const Icon = kind === "Prepaid" ? TollOutlinedIcon : kind === "Card" ? CreditCardOutlinedIcon : AccountBalanceOutlinedIcon;
  const color = problem ? "warning.main" : "text.secondary";
  const tip = (
    <Box sx={{ py: 0.25 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{label || name}</Typography>
      <Typography sx={{ fontSize: 12.5 }}>
        {balance != null && balance > 0 ? `Balance due: ${money(balance)}` : "Nothing due"}
      </Typography>
      {status != null && STATUS[status] && <Typography sx={{ fontSize: 12.5 }}>Facebook status: {STATUS[status]}</Typography>}
    </Box>
  );
  return (
    <Tooltip title={tip}>
      <Box
        component="span"
        tabIndex={0}
        aria-label={`${name}${problem ? ", payment problem" : ""}`}
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, color, cursor: "default", verticalAlign: "middle" }}
      >
        <Icon sx={{ fontSize: 20 }} />
        {showLabel && (
          <Typography component="span" sx={{ fontSize: 13.5, color: problem ? "warning.dark" : "text.primary", fontWeight: problem ? 600 : 400 }}>
            {name}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}
