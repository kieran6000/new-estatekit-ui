import { Box, Chip, Tooltip, type SxProps, type Theme } from "@mui/material";
import { useIsOperator } from "../hooks/useAutomations";
import { TAG_HELP, leadTags } from "../lib/leadTags";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";

// The tag chip, used everywhere a tag shows (leads list, lead page, the
// automation builder's previews). What the tags are: lib/leadTags.ts.

export default function LeadTag({ label, highlight = false }: { label: string; highlight?: boolean }) {
  const chip = (
    <Chip
      size="small"
      icon={<LocalOfferIcon />}
      label={label || "your tag"}
      color={highlight ? "info" : "default"}
      variant="outlined"
      sx={{ height: 22, fontSize: 12, fontWeight: 500, "& .MuiChip-icon": { fontSize: 14, ml: "6px" }, ...(highlight ? { outline: "2px solid #ffb300", outlineOffset: 2 } : {}) }}
    />
  );
  const help = TAG_HELP[label];
  return help ? <Tooltip title={help} enterTouchDelay={0}>{chip}</Tooltip> : chip;
}

/** A lead's tags, or nothing. Renders only for operators (it checks itself,
 *  so no page can forget to). */
export function LeadTags({ lead, sx }: { lead: { quality?: string | null }; sx?: SxProps<Theme> }) {
  const { data: isOperator } = useIsOperator();
  const tags = leadTags(lead);
  if (isOperator !== true || !tags.length) return null;
  return (
    <Box component="span" sx={{ display: "inline-flex", gap: 0.5, flexWrap: "wrap", verticalAlign: "middle", ...sx }}>
      {tags.map((t) => <LeadTag key={t} label={t} />)}
    </Box>
  );
}
