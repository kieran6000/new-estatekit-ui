import { useState } from "react";
import { Box, Button, Menu, MenuItem, Radio, TextField, Typography } from "@mui/material";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { DEFAULT_RANGES, RANGE_LABELS, rangeDates, resolveRange, ymd, type DateRange, type RangeKey } from "../lib/range";

/** "Last 7 days: 25 – 31 Oct 2026 ▾", opening the presets as in Ads Manager
 *  (each with its dates under it), plus two date boxes for Custom dates. */
export default function RangePicker({ value, onChange, options = DEFAULT_RANGES }: { value: DateRange; onChange: (r: DateRange) => void; options?: RangeKey[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const resolved = resolveRange(value);
  function pick(key: RangeKey) {
    setAnchor(null);
    if (key !== "custom") return onChange({ key });
    // Start the custom range from whatever was showing.
    onChange({ key, from: ymd(resolved.since), to: ymd(new Date(resolved.until.getTime() - 864e5)) });
  }
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
      <Button
        variant="outlined"
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<CalendarMonthOutlinedIcon sx={{ color: "text.secondary" }} />}
        endIcon={<ArrowDropDownIcon />}
        aria-label="Date range"
        aria-haspopup="menu"
        sx={{ textTransform: "none", fontWeight: 400, fontSize: 14, borderColor: "divider", minHeight: 40, whiteSpace: "nowrap" }}
      >
        <b>{value.key === "custom" ? "Custom" : RANGE_LABELS[value.key]}:</b>&nbsp;{rangeDates(value)}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 260 } } }}>
        {options.map((k) => (
          <MenuItem key={k} selected={value.key === k} onClick={() => pick(k)} sx={{ gap: 1, py: 0.75 }}>
            <Radio checked={value.key === k} size="small" sx={{ p: 0.5 }} tabIndex={-1} />
            <Box>
              <Typography sx={{ fontSize: 15 }}>{RANGE_LABELS[k]}</Typography>
              {k !== "custom" && <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{rangeDates({ key: k })}</Typography>}
            </Box>
          </MenuItem>
        ))}
      </Menu>
      {value.key === "custom" && (
        <>
          <TextField
            size="small"
            type="date"
            label="From"
            value={value.from || ""}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={value.to || ""}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </>
      )}
    </Box>
  );
}
