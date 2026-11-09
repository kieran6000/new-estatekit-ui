import { Box, Tooltip, Typography } from "@mui/material";
import { addDays } from "../lib/adHistory";
import { tokens } from "../theme";

// One slim strip of little squares, one per day (or per week for long ranges):
// darker when more leads came in, with an orange dot under days their ads were
// changed. Tap a dotted square to see what changed. Nothing else.

export interface CalendarDay { leads: number; spent: number | null; changes: number }

const DOT = "#f97316";
const FILL = [0, 22, 45, 68, 92];
const fill = (level: number) => (level ? `color-mix(in srgb, ${tokens.primary} ${FILL[level]}%, transparent)` : tokens.surface2);
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const monthShort = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short" });
const rand = (n: number) => "R" + Math.round(n).toLocaleString("en-GB").replace(/,/g, " ");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

interface Cell { start: string; end: string; leads: number; spent: number | null; changes: number; firstOfMonth: boolean }

export default function ChangeCalendar({ since, until, days, picked, onPick }: {
  since: string; until: string; days: Record<string, CalendarDay>; picked: string | null; onPick: (range: { start: string; end: string } | null) => void;
}) {
  const end = until < today() ? until : today();
  const all: string[] = [];
  for (let d = since; d <= end; d = addDays(d, 1)) all.push(d);
  const size = all.length > 92 ? 7 : 1; // long ranges: a square a week
  const cells: Cell[] = [];
  for (let i = 0; i < all.length; i += size) {
    const group = all.slice(i, i + size);
    const ds = group.map((d) => days[d]).filter(Boolean);
    cells.push({
      start: group[0], end: group[group.length - 1],
      leads: ds.reduce((n, d) => n + d.leads, 0),
      spent: ds.some((d) => d.spent != null) ? ds.reduce((n, d) => n + (d.spent ?? 0), 0) : null,
      changes: ds.reduce((n, d) => n + d.changes, 0),
      firstOfMonth: i === 0 || group.some((d) => d.endsWith("-01")),
    });
  }
  const most = Math.max(0, ...cells.map((c) => c.leads));
  const level = (n: number) => (!n || !most ? 0 : Math.min(4, Math.ceil((n / most) * 4)));

  return (
    <Box>
      <Box sx={{ display: "flex", gap: "3px", alignItems: "flex-start" }}>
        {cells.map((c) => {
          const on = picked === c.start;
          const changed = c.changes > 0;
          return (
            <Tooltip key={c.start} arrow disableInteractive title={
              <Box sx={{ py: 0.25 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{c.start === c.end ? longDay(c.start) : `${longDay(c.start)} to ${longDay(c.end)}`}</Typography>
                <Typography sx={{ fontSize: 12.5 }}>{plural(c.leads, "lead")}{c.spent != null ? ` · ${rand(c.spent)} spent` : ""}</Typography>
                {changed && <Typography sx={{ fontSize: 12.5 }}>Ads changed. Tap to see</Typography>}
              </Box>
            }>
              <Box
                component={changed ? "button" : "div"}
                type={changed ? "button" : undefined}
                onClick={changed ? () => onPick(on ? null : { start: c.start, end: c.end }) : undefined}
                aria-label={changed ? `${longDay(c.start)}: ads changed, ${plural(c.leads, "lead")}` : undefined}
                aria-pressed={changed ? on : undefined}
                sx={{ flex: "1 1 0", minWidth: 0, maxWidth: 40, p: 0, border: 0, bgcolor: "transparent", cursor: changed ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", "&:hover > .sq": changed ? { outline: `2px solid ${tokens.ink}` } : undefined }}
              >
                <Box className="sq" sx={{ width: "100%", height: 22, borderRadius: "4px", bgcolor: fill(level(c.leads)), outline: on ? `2px solid ${tokens.ink}` : "none", outlineOffset: 1 }} />
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: changed ? DOT : "transparent" }} />
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      {/* Just the month names, where each month starts. */}
      <Box sx={{ display: "flex", gap: "3px", mt: 0.25 }}>
        {cells.map((c) => (
          <Box key={c.start} sx={{ flex: "1 1 0", minWidth: 0, maxWidth: 40, position: "relative", height: 16 }}>
            {c.firstOfMonth && <Typography component="span" sx={{ position: "absolute", left: 0, fontSize: 12, color: tokens.ink2, whiteSpace: "nowrap" }}>{monthShort(c.end.endsWith("-01") ? c.end : c.start)}</Typography>}
          </Box>
        ))}
      </Box>
      <Typography sx={{ fontSize: 12.5, color: tokens.ink3, mt: 0.75, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        Darker = more leads that {size === 7 ? "week" : "day"}
        <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: DOT, ml: 1 }} />
        ads changed, tap to see
      </Typography>
    </Box>
  );
}
