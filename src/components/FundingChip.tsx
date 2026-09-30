import { Chip, Tooltip } from "@mui/material";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import TollOutlinedIcon from "@mui/icons-material/TollOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import { fundingKind } from "../api/clients";

const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

/** How an ad account pays Facebook: a card icon for a card, coins for money
 *  added up front (prepaid). Turns orange with "owes R…" when Facebook shows
 *  an amount due on the account (Meta's `balance`: the bill amount due). */
export default function FundingChip({
  type,
  label,
  balance,
}: {
  type: string | null | undefined;
  label?: string | null;
  balance?: number | null;
}) {
  const kind = fundingKind(type);
  if (!kind) return null;
  const owes = balance != null && balance > 0;
  const name = kind === "Prepaid" ? "Prepaid funds" : kind;
  const icon =
    kind === "Prepaid" ? <TollOutlinedIcon /> : kind === "Card" ? <CreditCardOutlinedIcon /> : <AccountBalanceOutlinedIcon />;
  const tip = [label, owes ? `Owes Facebook ${money(balance!)} right now` : ""].filter(Boolean).join(" · ");
  return (
    <Tooltip title={tip} disableHoverListener={!tip}>
      <Chip
        size="small"
        variant="outlined"
        icon={icon}
        color={owes ? "warning" : "default"}
        label={owes ? `${name} · owes ${money(balance!)}` : name}
        sx={{ height: 24, fontSize: 12, fontWeight: owes ? 600 : 400, "& .MuiChip-icon": { fontSize: 16 } }}
      />
    </Tooltip>
  );
}
