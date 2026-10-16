import { Box, ButtonBase, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

// "When suits you for a quick call?": a day (the next 7) and a part of the
// day. A request for a call, not a booked appointment: nothing is promised
// at an exact time, which is true for every agent. The answer is saved as
// text like "Thu 16 Oct · Morning (8–12)"; while only the day is picked it is
// "Thu 16 Oct · " (ends with the separator), so "Next" can ask for a time.

export const CALL_TIME_SEP = " · ";

export const CALL_SLOTS = [
  { label: "Morning (8–12)", endsAt: 12 },
  { label: "Afternoon (12–4)", endsAt: 16 },
  { label: "After work (4–7)", endsAt: 19 },
];

/** The default line shown once both are picked; {agent} = agent's first name. */
export const CALL_TIME_CONFIRM = "{agent} will call you then to confirm.";

function nextDays(n = 7): { key: string; short: string }[] {
  const out: { key: string; short: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    // Saved form, e.g. "Thu 16 Oct": readable in WhatsApp and on the lead.
    const key = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
    const short = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric" }).replace(/,/g, "");
    out.push({ key, short });
  }
  return out;
}

export function callTimeIncomplete(value: string): boolean {
  return value.endsWith(CALL_TIME_SEP);
}

export default function CallTimeStep({
  question,
  required,
  confirmText,
  value,
  accent,
  error,
  onChange,
}: {
  question: string;
  required: boolean;
  /** Shown once a day and a time are picked. */
  confirmText: string;
  value: string;
  accent: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const days = nextDays();
  const [pickedDay = "", pickedSlot = ""] = value ? value.split(CALL_TIME_SEP) : [];
  const hourNow = new Date().getHours();
  const isToday = pickedDay === days[0].key;

  const box = (selected: boolean, disabled = false) => ({
    borderRadius: "8px",
    border: `1.5px solid ${selected ? accent : "#dadce0"}`,
    bgcolor: selected ? `${accent}14` : "#fff",
    color: disabled ? "#9aa0a6" : "#202124",
    fontWeight: selected ? 600 : 500,
    minHeight: 48,
    px: 1,
    fontSize: 15,
    opacity: disabled ? 0.55 : 1,
    width: "100%",
  });

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
        {question}
        {required && <Box component="span" sx={{ color: "error.main" }}> *</Box>}
      </Typography>

      <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 1.5, mb: 0.75 }}>Pick a day</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1 }} role="radiogroup" aria-label="Day">
        {days.map((d) => {
          const selected = pickedDay === d.key;
          return (
            <ButtonBase
              key={d.key}
              role="radio"
              aria-checked={selected}
              // Changing the day keeps the time if it still works for that day.
              onClick={() => {
                const today = d.key === days[0].key;
                const slotOk = pickedSlot && !(today && (CALL_SLOTS.find((s) => s.label === pickedSlot)?.endsAt ?? 24) <= hourNow);
                onChange(d.key + CALL_TIME_SEP + (slotOk ? pickedSlot : ""));
              }}
              sx={box(selected)}
            >
              {d.short}
            </ButtonBase>
          );
        })}
      </Box>

      <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 2, mb: 0.75 }}>Pick a time</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} role="radiogroup" aria-label="Time">
        {CALL_SLOTS.map((s) => {
          const selected = pickedSlot === s.label;
          // Today's slots that are already over can't be picked.
          const past = isToday && s.endsAt <= hourNow;
          return (
            <ButtonBase
              key={s.label}
              role="radio"
              aria-checked={selected}
              disabled={past || !pickedDay}
              onClick={() => onChange(pickedDay + CALL_TIME_SEP + s.label)}
              sx={{ ...box(selected, past || !pickedDay), justifyContent: "flex-start", px: 2 }}
            >
              {s.label}
              {past && <Box component="span" sx={{ ml: 1, fontSize: 13, fontWeight: 400 }}>· passed</Box>}
            </ButtonBase>
          );
        })}
      </Box>

      {pickedDay && pickedSlot && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2, p: 1.5, borderRadius: "8px", bgcolor: "#e6f4ea", color: "#137333" }}>
          <CheckCircleIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontSize: 14.5 }}>{confirmText}</Typography>
        </Box>
      )}
      {error && <Typography sx={{ fontSize: 12.5, color: "error.main", mt: 1 }}>{error}</Typography>}
    </Box>
  );
}
