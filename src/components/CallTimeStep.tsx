import { useState, type ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

// "When suits you for a quick call?" — built from the same radio list as
// every other choice question on the form, so it works the way people already
// expect: one small choice per screen, tap an answer and the form moves on.
//   1. Which day: Today / Tomorrow / Later this week / Any time is fine
//   2. Which time: Morning / Afternoon / After work (then it moves on)
// Choices that can't work (today when it's late, a time that has passed) are
// left out rather than greyed out. A request for a call, not a booking: the
// agent confirms, which is true for every agent.
// Saved as text, e.g. "Tomorrow (Fri 17 Oct), morning".

export const CALL_TIME_CONFIRM = "{agent} will call you then to confirm.";
export const ANY_TIME = "Any time is fine";

const SLOTS = [
  { label: "Morning", saved: "morning", endsAt: 12 },
  { label: "Afternoon", saved: "afternoon", endsAt: 16 },
  { label: "After work", saved: "after work", endsAt: 19 },
];

const dateText = (d: Date) => d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");

/** The day choices for right now. */
function dayChoices(now = new Date()) {
  const hour = now.getHours();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dow = now.getDay(); // 0 Sun … 6 Sat
  const days: { label: string; saved: string; today?: boolean }[] = [];
  // Today only while at least one time is still ahead (with an hour to spare).
  if (SLOTS.some((s) => s.endsAt - 1 > hour)) days.push({ label: "Today", saved: `Today (${dateText(now)})`, today: true });
  days.push({ label: "Tomorrow", saved: `Tomorrow (${dateText(tomorrow)})` });
  const later = dow >= 1 && dow <= 3 ? "Later this week" : "Early next week";
  days.push({ label: later, saved: later });
  return days;
}

export default function CallTimeStep({
  question,
  confirmText,
  value,
  error,
  renderChoices,
  onAnswer,
}: {
  question: string;
  /** Shown above the times, e.g. "Zainub will call you then to confirm." */
  confirmText: string;
  /** The saved answer, if they come back to this step. */
  value: string;
  error?: string;
  /** The form's own radio list: (question, options, picked, onPick). */
  renderChoices: (question: string, options: string[], picked: string, onPick: (v: string) => void, sub?: ReactNode) => ReactNode;
  /** Final answer: the form saves it and moves on, like any choice. */
  onAnswer: (v: string) => void;
}) {
  const days = dayChoices();
  const savedDay = value && value !== ANY_TIME ? days.find((d) => value.startsWith(d.saved)) : undefined;
  const [day, setDay] = useState<(typeof days)[number] | null>(null);

  if (!day) {
    return (
      <Box>
        {renderChoices(
          question,
          [...days.map((d) => d.label), ANY_TIME],
          value === ANY_TIME ? ANY_TIME : savedDay?.label ?? "",
          (v) => {
            if (v === ANY_TIME) return onAnswer(ANY_TIME);
            const picked = days.find((d) => d.label === v);
            if (picked) setDay(picked);
          },
        )}
        {error && <Typography sx={{ fontSize: 12.5, color: "error.main", mt: 1 }}>{error}</Typography>}
      </Box>
    );
  }

  const hour = new Date().getHours();
  const slots = SLOTS.filter((s) => !day.today || s.endsAt - 1 > hour);
  const savedSlot = value.startsWith(day.saved) ? SLOTS.find((s) => value.endsWith(", " + s.saved))?.label ?? "" : "";
  return (
    <Box>
      {renderChoices(
        `What time ${day.label.toLowerCase()}?`,
        slots.map((s) => s.label),
        savedSlot,
        (v) => {
          const s = SLOTS.find((x) => x.label === v);
          if (s) onAnswer(`${day.saved}, ${s.saved}`);
        },
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: -0.5, mb: 1.25 }}>{confirmText}</Typography>,
      )}
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setDay(null)} sx={{ mt: 1.5, color: "text.secondary" }}>
        Change day
      </Button>
    </Box>
  );
}
