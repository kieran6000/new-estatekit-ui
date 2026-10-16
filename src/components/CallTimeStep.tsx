import { Box, TextField, Typography } from "@mui/material";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";

// "When suits you for a quick call?" — set like an appointment: a day and a
// time, side by side, each the phone's own picker (the scroll wheel on an
// iPhone, the list on Android), then a line saying the agent will confirm.
// It's a request for a call, not a booked slot, so it says "around".
// Saved as text, e.g. "Fri 17 Oct, around 10:00". While only one of the two
// is chosen the answer is partial ("Fri 17 Oct, around " or ", around 10:00")
// so "Next Step" can ask for the other.

export const CALL_TIME_CONFIRM = "{agent} will call you around then to confirm.";
const AROUND = ", around ";
const FIRST_HOUR = 8;
const LAST_HOUR = 18;

const dateText = (d: Date) => d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** The next 7 days; today only while there's still a time left today. */
function days(now = new Date()) {
  const out: { value: string; label: string; today: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (i === 0 && now.getHours() + 1 > LAST_HOUR) continue;
    const text = dateText(d);
    out.push({ value: text, label: i === 0 ? `Today (${text})` : i === 1 ? `Tomorrow (${text})` : text, today: i === 0 });
  }
  return out;
}

/** Hours to offer: 08:00–18:00; today, only from the next full hour. */
function hours(today: boolean, now = new Date()) {
  const from = today ? Math.max(FIRST_HOUR, now.getHours() + 1) : FIRST_HOUR;
  const out: string[] = [];
  for (let h = from; h <= LAST_HOUR; h++) out.push(hh(h));
  return out;
}

/** Only the day or only the time has been chosen. */
export function callTimeIncomplete(v: string): boolean {
  if (!v) return false;
  const [d = "", t = ""] = v.split(AROUND);
  return !d || !t;
}

export default function CallTimeStep({
  question,
  required,
  confirmText,
  value,
  error,
  onChange,
}: {
  question: string;
  required: boolean;
  /** Shown under the two pickers, e.g. "Zainub will call you around then to confirm." */
  confirmText: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const dayList = days();
  const [day = "", time = ""] = value ? value.split(AROUND) : [];
  const pickedDay = dayList.find((d) => d.value === day);
  const hourList = hours(!!pickedDay?.today);

  const set = (d: string, t: string) => onChange(d || t ? `${d}${AROUND}${t}` : "");

  // The phone's own picker; MUI only styles the box around it.
  const picker = {
    select: true,
    fullWidth: true,
    sx: { "& select": { fontSize: 16, py: 1.5 } },
  } as const;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1.5 }}>
        {question}
        {required && <Box component="span" sx={{ color: "error.main" }}> *</Box>}
      </Typography>

      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 1.25 }}>
        <TextField
          {...picker}
          label="Day"
          value={pickedDay ? day : ""}
          onChange={(e) => {
            const d = e.target.value;
            const today = dayList.find((x) => x.value === d)?.today;
            // Keep the time if it still works for the new day.
            set(d, time && hours(!!today).includes(time) ? time : "");
          }}
          error={!!error && !pickedDay}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true }, input: { startAdornment: <CalendarTodayOutlinedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} /> } }}
        >
          <option value="" disabled>Select day</option>
          {dayList.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </TextField>
        <TextField
          {...picker}
          label="Time"
          value={hourList.includes(time) ? time : ""}
          onChange={(e) => set(day, e.target.value)}
          error={!!error && !hourList.includes(time)}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true }, input: { startAdornment: <ScheduleOutlinedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} /> } }}
        >
          <option value="" disabled>Select time</option>
          {hourList.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </TextField>
      </Box>

      <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 1.25 }}>{confirmText}</Typography>
      {error && <Typography sx={{ fontSize: 12.5, color: "error.main", mt: 0.75 }}>{error}</Typography>}
    </Box>
  );
}
