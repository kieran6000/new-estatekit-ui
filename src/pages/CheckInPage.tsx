import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { FACES } from "../components/Faces";
import { getCheckin, submitCheckin } from "../api/checkins";
import { askForReview, cleanQuestions, scoreCheckin, type CheckinAnswers, type CheckinQuestion } from "../lib/checkin";
import { supabase } from "../api/_client";

// The client's check-in: /k/<token>, the link the team sends on WhatsApp. No
// sign-in and no name to type: the link is theirs. A tap for each rating, and
// a box for anything written (optional). Ratings are faces, from a frown to
// a grin. After a really good one (and only then) it asks, gently, for a
// Google review.

const BLUE = "#1a56db";
const GOLD = "#f59e0b";

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

function Scale({ q, value, onPick }: { q: CheckinQuestion; value: number | undefined; onPick: (n: number) => void }) {
  // Each face has its words right under it: the two ends say what they mean
  // (e.g. "Poor" and "Great"), and the one picked lights up in its colour.
  const words = (n: number) => (n === 1 ? q.low : n === 5 ? q.high : FACES[n - 1].word) || FACES[n - 1].word;
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, mb: 3.5 }}>
      <Typography component="legend" sx={{ fontSize: 17, fontWeight: 600, mb: 1, lineHeight: 1.35 }}>{q.label}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", maxWidth: 400, columnGap: 0.5 }}>
        {FACES.map((f) => {
          const on = value === f.n;
          const showWord = on || f.n === 1 || f.n === 5;
          return (
            <Box key={f.n} sx={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
              <Box
                component="button"
                type="button"
                aria-pressed={on}
                aria-label={words(f.n)}
                onClick={() => onPick(f.n)}
                sx={{
                  width: 62, height: 62, p: 0, display: "grid", placeItems: "center", border: 0, borderRadius: "50%", cursor: "pointer",
                  bgcolor: on ? `${f.color}1f` : "transparent",
                  color: on ? f.color : value === undefined ? "#9ca3af" : "#d1d5db",
                  transform: on ? "scale(1.12)" : "none", transition: "transform .12s, color .12s, background-color .12s",
                  "&:hover": { color: f.color },
                  "&:focus-visible": { outline: `3px solid ${BLUE}`, outlineOffset: 1 },
                }}
              >
                <f.Icon sx={{ fontSize: 50 }} />
              </Box>
              <Typography aria-hidden sx={{
                mt: 0.5, minHeight: 34, fontSize: 13, lineHeight: 1.3, textAlign: "center", overflowWrap: "anywhere",
                visibility: showWord ? "visible" : "hidden",
                fontWeight: on ? 700 : 400, color: on ? f.color : value !== undefined ? "#9ca3af" : "#6b7280",
              }}>
                {words(f.n)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Shown after a really good check-in, if there's a review link. Warm, short, easy to skip. */
function ReviewAsk({ link, first }: { link: string; first: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <Box sx={{ mt: 3, p: 2.25, borderRadius: "12px", bgcolor: "#fffbeb", border: "1px solid #fde68a" }}>
      <Box sx={{ display: "flex", gap: 0.25, color: GOLD, mb: 1 }} aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => <StarRoundedIcon key={n} sx={{ fontSize: 26 }} />)}
      </Box>
      <Typography sx={{ fontSize: 18, fontWeight: 700 }}>That honestly made our day{first ? `, ${first}` : ""}.</Typography>
      <Typography sx={{ mt: 1, fontSize: 16, color: "#374151", lineHeight: 1.5 }}>
        We're a small team, and kind words from agents like you are how other agents find us. If you have a minute, would you share them in a Google review? Only if you'd like to.
      </Typography>
      <Button component="a" href={link} target="_blank" rel="noopener noreferrer" variant="contained" disableElevation fullWidth sx={{ mt: 2, minHeight: 52, fontSize: 17, fontWeight: 700, bgcolor: BLUE, borderRadius: "10px" }}>
        Leave a Google review
      </Button>
      <Button fullWidth onClick={() => setGone(true)} sx={{ mt: 0.75, color: "#4b5563" }}>Maybe another time</Button>
    </Box>
  );
}

export default function CheckInPage() {
  const { token = "" } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ["checkin", token], queryFn: () => getCheckin(token), staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 });
  const [answers, setAnswers] = useState<CheckinAnswers>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"ok" | "answered" | "expired" | "error" | null>(null);
  useEffect(() => { document.title = "EstateKit check-in"; }, []);

  const questions = cleanQuestions(data?.questions);
  const ratings = questions.filter((q) => q.type === "rating");
  const done = ratings.filter((q) => typeof answers[q.id] === "number").length;
  const complete = done === ratings.length;

  async function send() {
    if (!complete) return;
    setSending(true);
    try {
      const r = await submitCheckin(token, answers);
      if (r === "ok") {
        setResult("ok");
        // Tell the team, best-effort.
        if (data?.agent_id) {
          const s = scoreCheckin(answers, questions);
          const scores = ratings.map((q) => `${q.short} ${answers[q.id]}`).join(" · ");
          const said = questions.filter((q) => q.type === "text" && String(answers[q.id] ?? "").trim()).map((q) => `"${String(answers[q.id]).trim().slice(0, 300)}"`).join(" ");
          void supabase.functions.invoke("track-activity", { body: { event: "checkin_answered", agentId: data.agent_id, detail: `${s.risk === "red" ? "At risk · " : ""}average ${s.average} of 5 · ${scores}${said ? ` · ${said}` : ""}` } }).catch(() => {});
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
        {result === "ok" && data.review_link && askForReview(answers, questions) && <ReviewAsk link={data.review_link} first={first} />}
      </Page>
    );
  }
  if (data.status === "expired" || result === "expired") {
    return <Page><Typography sx={{ fontSize: 20, fontWeight: 700 }}>This check-in link has expired</Typography><Typography sx={{ mt: 1, color: "#4b5563" }}>Ask your EstateKit contact for a new one.</Typography></Page>;
  }

  return (
    <Page>
      <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>{first ? `Hi ${first}, how's it going?` : "How's it going?"}</Typography>
      <Typography sx={{ mt: 0.75, mb: 3, fontSize: 16, color: "#374151" }}>Tap a face for each. It takes a minute.</Typography>
      {questions.map((q) =>
        q.type === "rating" ? (
          <Scale key={q.id} q={q} value={typeof answers[q.id] === "number" ? (answers[q.id] as number) : undefined} onPick={(n) => setAnswers((a) => ({ ...a, [q.id]: n }))} />
        ) : (
          <Box key={q.id} sx={{ mb: 3 }}>
            <Typography component="label" htmlFor={`ek-q-${q.id}`} sx={{ display: "block", fontSize: 17, fontWeight: 600, mb: 1 }}>{q.label} <Box component="span" sx={{ fontWeight: 400, color: "#6b7280" }}>(optional)</Box></Typography>
            <TextField id={`ek-q-${q.id}`} value={String(answers[q.id] ?? "")} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} multiline minRows={3} fullWidth slotProps={{ htmlInput: { maxLength: 2000 } }} />
          </Box>
        ),
      )}
      {result === "error" && <Typography role="alert" sx={{ mt: 1, color: "#b91c1c", fontWeight: 600 }}>That didn't send. Check your signal and try again.</Typography>}
      <Button variant="contained" disableElevation fullWidth disabled={!complete || sending} onClick={send} sx={{ mt: 1, minHeight: 56, fontSize: 18, fontWeight: 700, bgcolor: BLUE, borderRadius: "10px" }}>
        {sending ? "Sending…" : "Send"}
      </Button>
      {!complete && <Typography sx={{ mt: 1, textAlign: "center", fontSize: 14, color: "#4b5563" }}>{done} of {ratings.length} answered</Typography>}
    </Page>
  );
}
