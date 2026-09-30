import { Box, MenuItem, TextField } from "@mui/material";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import { RANGE_LABELS, resolveRange, ymd, type DateRange, type RangeKey } from "../lib/range";

/** "Last 30 days ▾" plus two date boxes when "Custom dates" is picked. */
export default function RangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const resolved = resolveRange(value);
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
      <TextField
        select
        size="small"
        value={value.key}
        onChange={(e) => {
          const key = e.target.value as RangeKey;
          if (key !== "custom") return onChange({ key });
          // Start the custom range from whatever was showing.
          onChange({ key, from: ymd(resolved.since), to: ymd(new Date(resolved.until.getTime() - 864e5)) });
        }}
        sx={{ minWidth: 170 }}
        slotProps={{ input: { startAdornment: <CalendarMonthOutlinedIcon sx={{ fontSize: 18, mr: 1, color: "text.secondary" }} /> } }}
        aria-label="Date range"
      >
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
          <MenuItem key={k} value={k}>{RANGE_LABELS[k]}</MenuItem>
        ))}
      </TextField>
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
