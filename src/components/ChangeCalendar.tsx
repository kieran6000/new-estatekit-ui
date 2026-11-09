import { useEffect, useState } from "react";
import { Box, IconButton, Tooltip, Typography, useMediaQuery } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { monthCells, monthsBetween } from "../lib/adHistory";
import { tokens } from "../theme";

// Little month calendars, like the one in the corner of Google Calendar:
// each day is shaded by how many leads came in, and a dot marks a day
// something was changed on their ads. Tap a dotted day to see what changed.

export interface CalendarDay { leads: number; spent: number | null; changes: number }

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DOT = "#f97316";
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const rand = (n: number) => "R" + Math.round(n).toLocaleString("en-GB").replace(/,/g, " ");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

/** How dark a day is: none, then four steps up to their busiest day. */
function shade(leads: number, most: number): number {
  if (!leads || !most) return 0;
  return Math.min(4, Math.ceil((leads / most) * 4));
}
const FILL = [0, 18, 38, 62, 90];
const fill = (level: number) => `color-mix(in srgb, ${tokens.primary} ${FILL[level]}%, transparent)`;

export default function ChangeCalendar({ since, until, days, picked, onPick }: {
  since: string; until: string; days: Record<string, CalendarDay>; picked: string | null; onPick: (day: string | null) => void;
}) {
  const phone = useMediaQuery("(max-width:600px)");
  const mid = useMediaQuery("(max-width:1100px)");
  const perPage = phone ? 1 : mid ? 2 : 3;
  const months = monthsBetween(since, until);
  const lastPage = Math.max(0, months.length - perPage);
  const [start, setStart] = useState(lastPage);
  useEffect(() => setStart(lastPage), [lastPage, since, until]);
  const shown = months.slice(start, start + perPage);
  const most = Math.max(0, ...Object.values(days).map((d) => d.leads));
  const now = today();

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        {months.length > perPage && (
          <IconButton size="small" aria-label="Earlier months" disabled={start === 0} onClick={() => setStart(Math.max(0, start - perPage))}><ChevronLeftIcon /></IconButton>
        )}
        <Box sx={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))`, columnGap: 4, rowGap: 2 }}>
          {shown.map((month) => (
            <Box key={month} sx={{ minWidth: 0, maxWidth: 280, mx: "auto", width: "100%" }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, textAlign: "center", mb: 0.75 }}>{monthName(month)}</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "3px" }}>
                {WEEKDAYS.map((w, i) => <Typography key={i} sx={{ fontSize: 11, color: tokens.ink3, textAlign: "center", pb: 0.25 }}>{w}</Typography>)}
                {monthCells(month).map((day, i) => {
                  if (!day) return <Box key={`b${i}`} />;
                  const inRange = day >= since && day <= until && day <= now;
                  const d = days[day];
                  const level = inRange ? shade(d?.leads ?? 0, most) : 0;
                  const changed = inRange && (d?.changes ?? 0) > 0;
                  const on = picked === day;
                  const cell = (
                    <Box
                      component={changed ? "button" : "div"}
                      type={changed ? "button" : undefined}
                      onClick={changed ? () => onPick(on ? null : day) : undefined}
                      aria-label={changed ? `${longDay(day)}: ${plural(d!.changes, "change")}, ${plural(d!.leads, "lead")}` : undefined}
                      aria-pressed={changed ? on : undefined}
                      sx={{
                        position: "relative", width: "100%", aspectRatio: "1", p: 0, border: 0, font: "inherit", borderRadius: "6px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12.5, fontVariantNumeric: "tabular-nums", fontWeight: day === now ? 800 : 500,
                        color: !inRange ? tokens.ink3 : level >= 3 ? "#fff" : "text.primary",
                        opacity: inRange ? 1 : 0.45,
                        bgcolor: level ? fill(level) : inRange ? tokens.surface2 : "transparent",
                        outline: on ? `2px solid ${tokens.ink}` : "none", outlineOffset: 1,
                        cursor: changed ? "pointer" : "default",
                        transition: "transform .1s",
                        "&:hover": changed ? { transform: "scale(1.12)", outline: `2px solid ${tokens.ink}` } : undefined,
                      }}
                    >
                      {Number(day.slice(8))}
                      {changed && <Box component="span" sx={{ position: "absolute", bottom: "10%", left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", bgcolor: level >= 3 ? "#fff" : DOT }} />}
                    </Box>
                  );
                  return inRange ? (
                    <Tooltip key={day} arrow disableInteractive title={
                      <Box sx={{ py: 0.25 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{longDay(day)}</Typography>
                        <Typography sx={{ fontSize: 12.5 }}>{plural(d?.leads ?? 0, "lead")}{d?.spent != null ? ` · ${rand(d.spent)} spent` : ""}</Typography>
                        {changed && <Typography sx={{ fontSize: 12.5 }}>{plural(d!.changes, "change")} to their ads. Tap to see</Typography>}
                      </Box>
                    }>{cell}</Tooltip>
                  ) : <Box key={day}>{cell}</Box>;
                })}
              </Box>
            </Box>
          ))}
        </Box>
        {months.length > perPage && (
          <IconButton size="small" aria-label="Later months" disabled={start >= lastPage} onClick={() => setStart(Math.min(lastPage, start + perPage))}><ChevronRightIcon /></IconButton>
        )}
      </Box>

      {/* The key, in words. */}
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 3, rowGap: 0.5, mt: 1.5, fontSize: 12.5, color: tokens.ink2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          Fewer leads
          {[1, 2, 3, 4].map((l) => <Box key={l} sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: fill(l) }} />)}
          More leads
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: DOT }} />
          Their ads were changed. Tap the day to see what
        </Box>
      </Box>
    </Box>
  );
}
