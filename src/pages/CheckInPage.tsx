import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { getCheckin, submitCheckin } from "../api/checkins";
import { COMMENT_QUESTION, QUESTIONS, scoreCheckin, RISK_WORDS, type CheckinAnswers, type CheckinKey } from "../lib/checkin";
import { supabase } from "../api/_client";

// The client's weekly check-in: /k/<token>, the link the team sends on
// WhatsApp. No sign-in and no name to type: the link is theirs. Five taps
// and an optional comment.

const BLUE = "#1a56db";

function Page({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f3f4f6", color: "#111827", px: 2, py: { xs: 3, sm: 6 } }}>
      <Box sx={{ maxWidth: 560, mx: "auto" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", mb: 1.5 }}>EstateKit</Typography>
        <Box sx={{ bgcolor: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", p: { xs: 2.25, sm: 3.5 } }}>{children}</Box>
      </Box>
    </Box>
  );
}

function Scale({ q, value, onPick }: { q: (typeof QUESTIONS)[number]; value: number | undefined; onPick: (n: number) => void }) {
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, mb: 3 }}>
      <Typography component="legend" sx={{ fontSize: 17, fontWeight: 600, mb: 1.25, lineHeight: 1.35 }}>{q.label}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <Box
              key={n}
              component="button"
              type="button"
              aria-pressed={on}
              aria-label={`${n} out of 5${n === 1 ? `, ${q.low}` : n === 5 ? `, ${q.high}` : ""}`}
              onClick={() => onPick(n)}
              sx={{ height: 56, borderRadius: "10px", border: `2px solid ${on ? BLUE : "#d1d5db"}`, bgcolor: on ? BLUE : "#fff", color: on ? "#fff" : "#111827", fontSize: 22, fontWeight: 700, cursor: "pointer", font: "inherit", fontFamily: "inherit", "&:focus-visible": { outline: `3px solid ${BLUE}`, outlineOffset: 2 } }}
            >
              <Box component="span" sx={{ fontSize: 22, fontWeight: 700 }}>{n}</Box>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.75, fontSize: 13.5, color: "#4b5563" }}>
        <span>1 = {q.low}</span>
        <span>5 = {q.high}</span>
      </Box>
    </Box>
  );
}

export default function CheckInPage() {
  const { token = "" } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ["checkin", token], queryFn: () => getCheckin(token), staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 });
  const [answers, setAnswers] = useState<Partial<CheckinAnswers>>({});
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"ok" | "answered" | "expired" | "error" | null>(null);
  useEffect(() => { document.title = "EstateKit check-in"; }, []);

  const done = QUESTIONS.filter((q) => answers[q.key]).length;
  const complete = done === QUESTIONS.length;

  async function send() {
    if (!complete) return;
    setSending(true);
    try {
      const r = await submitCheckin(token, answers as CheckinAnswers, comment);
      if (r === "ok") {
        setResult("ok");
        // Tell the team, best-effort.
        if (data?.agent_id) {
          const s = scoreCheckin(answers as CheckinAnswers);
          const scores = QUESTIONS.map((q) => `${q.short} ${answers[q.key]}`).join(" · ");
          void supabase.functions.invoke("track-activity", { body: { event: "checkin_answered", agentId: data.agent_id, detail: `${RISK_WORDS[s.risk]} · average ${s.average} of 5 · ${scores}${comment.trim() ? ` · "${comment.trim().slice(0, 400)}"` : ""}` } }).catch(() => {});
        }
      } else setResult(r === "answered" ? "answered" : r === "expired" ? "expired" : "error");
    } catch {
      setResult("error");
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return <Page><Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}><CircularProgress size={22} /><Typography>Opening your check-in…</Typography></Box></Page>;
  if (isError || !data) return <Page><Typography sx={{ fontSize: 20, fontWeight: 700 }}>We couldn't open this check-in</Typography><Typography sx={{ mt: 1, color: "#4b5563" }}>{isError ? "Check your signal and refresh the page." : "The link may be wrong. Ask your EstateKit contact for a new one."}</Typography></Page>;

  const first = data.first_name;
  if (result === "ok" || data.status === "answered" || result === "answered") {
    return (
      <Page>
        <CheckCircleIcon sx={{ fontSize: 44, color: "#15803d" }} />
        <Typography sx={{ fontSize: 22, fontWeight: 700, mt: 1 }}>{result === "ok" ? `Thank you${first ? `, ${first}` : ""}!` : "You've already sent this one"}</Typography>
        <Typography sx={{ mt: 1, fontSize: 16, color: "#374151" }}>{result === "ok" ? "We read every answer, and we'll act on what you told us." : "Thank you. We've got your answers."}</Typography>
      </Page>
    );
  }
  if (data.status === "expired" || result === "expired") {
    return <Page><Typography sx={{ fontSize: 20, fontWeight: 700 }}>This check-in link has expired</Typography><Typography sx={{ mt: 1, color: "#4b5563" }}>Ask your EstateKit contact for this week's link.</Typography></Page>;
  }

  return (
    <Page>
      <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>{first ? `Hi ${first}, how was your week?` : "How was your week?"}</Typography>
      <Typography sx={{ mt: 0.75, mb: 3, fontSize: 16, color: "#374151" }}>Tap a number for each. It takes a minute.</Typography>
      {QUESTIONS.map((q) => (
        <Scale key={q.key} q={q} value={answers[q.key]} onPick={(n) => setAnswers((a) => ({ ...a, [q.key as CheckinKey]: n }))} />
      ))}
      <Typography component="label" htmlFor="ek-checkin-comment" sx={{ display: "block", fontSize: 17, fontWeight: 600, mb: 1 }}>{COMMENT_QUESTION}</Typography>
      <TextField id="ek-checkin-comment" value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={3} fullWidth slotProps={{ htmlInput: { maxLength: 2000 } }} />
      {result === "error" && <Typography role="alert" sx={{ mt: 2, color: "#b91c1c", fontWeight: 600 }}>That didn't send. Check your signal and try again.</Typography>}
      <Button variant="contained" disableElevation fullWidth disabled={!complete || sending} onClick={send} sx={{ mt: 3, minHeight: 56, fontSize: 18, fontWeight: 700, bgcolor: BLUE, borderRadius: "10px" }}>
        {sending ? "Sending…" : "Send"}
      </Button>
      {!complete && <Typography sx={{ mt: 1, textAlign: "center", fontSize: 14, color: "#4b5563" }}>{done} of {QUESTIONS.length} answered</Typography>}
    </Page>
  );
}
