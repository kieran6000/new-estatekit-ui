import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Button, CircularProgress, InputAdornment, LinearProgress, TextField, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { tokens } from "../theme";
import { requestSignup } from "../api/signup";
import { ADMIN_WHATSAPP } from "../lib/contact";
import estateKitLogoWhite from "../assets/whitelogofull.png";

// The public "get a free account" form, reached from the "Powered by
// EstateKit" link on clients' lead pages. Built for completion rate: five
// short steps, mostly taps, contact details last (the same order our lead
// pages use), and only what we need to call them back and set them up.
// Everything else (Facebook access, photos, recent sales…) is collected at
// onboarding.

const ACCENT = "#1976d2";

const WANTS = ["Sellers (listings)", "Buyers", "Landlords & rentals", "Agents to recruit"];
const BUDGETS = ["Under R2 000", "R2 000 – R5 000", "R5 000+", "Not sure yet"];

type Step = "wants" | "suburbs" | "budget" | "agency" | "contact";
const STEPS: Step[] = ["wants", "suburbs", "budget", "agency", "contact"];

function phoneIsValid(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length >= 9 && d.length <= 13;
}

export default function SignupPage() {
  const [params] = useSearchParams();
  const ref = params.get("ref");
  const from = params.get("from");
  const posthog = usePostHog();

  const [phase, setPhase] = useState<"intro" | "steps" | "done">("intro");
  const [i, setI] = useState(0);
  const [wants, setWants] = useState<string[]>([]);
  const [suburbs, setSuburbs] = useState("");
  const [budget, setBudget] = useState("");
  const [agency, setAgency] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const step = STEPS[i];

  const props = { from, ref };
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    posthog.register({ signup_from: from, signup_ref: ref });
    posthog.capture("signup_viewed", props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = "Get a free EstateKit account";
  }, []);

  function start() {
    posthog.capture("signup_started", props);
    setPhase("steps");
  }

  function next() {
    setError("");
    posthog.capture("signup_step_completed", { ...props, step, index: i + 1 });
    setI((x) => Math.min(x + 1, STEPS.length - 1));
  }

  function back() {
    setError("");
    setI((x) => Math.max(0, x - 1));
  }

  function validate(): string {
    if (step === "wants" && !wants.length) return "Pick at least one.";
    if (step === "suburbs" && suburbs.trim().length < 2) return "Tell us at least one suburb or town.";
    if (step === "agency" && agency.trim().length < 2) return "Add your agency (or \"Independent\").";
    if (step === "contact") {
      if (name.trim().length < 2) return "Add your name.";
      if (!phoneIsValid(phone)) return "That WhatsApp number doesn't look right.";
    }
    return "";
  }

  async function onContinue() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    if (step !== "contact") { next(); return; }
    setBusy(true);
    try {
      await requestSignup({ name: name.trim(), whatsapp: phone, agency: agency.trim(), wants, suburbs: suburbs.trim(), budget, ref, source: from });
      posthog.capture("signup_submitted", { ...props, wants, budget });
    } catch (e) {
      // The WhatsApp button on the next screen carries every answer, so the
      // request still reaches us.
      console.error(e);
      setSaveFailed(true);
      posthog.capture("signup_save_failed", props);
    } finally {
      setBusy(false);
      setPhase("done");
    }
  }

  const waMessage =
    `Hi EstateKit, I'd like a free account.\n\n` +
    `Name: ${name.trim()}\nAgency: ${agency.trim()}\nLooking for: ${wants.join(", ")}\n` +
    `Areas: ${suburbs.trim()}\nAd budget: ${budget}`;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ bgcolor: ACCENT, p: "14px 20px", textAlign: "center" }}>
        <Box component="img" src={estateKitLogoWhite} alt="EstateKit" sx={{ height: 28, width: "auto", display: "inline-block", verticalAlign: "middle" }} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <Box sx={{ width: "100%", maxWidth: 480, mt: 2.5 }}>
          <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
            {phase === "steps" && (
              <LinearProgress
                variant="determinate"
                value={((i + 1) / STEPS.length) * 100}
                sx={{ height: 4, bgcolor: "#eee", "& .MuiLinearProgress-bar": { bgcolor: ACCENT } }}
              />
            )}

            <Box sx={{ p: "28px 24px", minHeight: 280, display: "flex", flexDirection: "column" }}>
              {phase === "intro" && (
                <Box sx={{ m: "auto 0" }}>
                  <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, textAlign: "center" }}>
                    Get seller leads sent straight to your WhatsApp
                  </Typography>
                  <Typography sx={{ fontSize: 14.5, color: "text.secondary", mt: 1, textAlign: "center" }}>
                    A free EstateKit account for estate agents. Takes about a minute.
                  </Typography>
                  <Box sx={{ mt: 2.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
                    {[
                      "Your own lead page, like the one you just saw",
                      "Every new lead on WhatsApp, with one tap to call",
                      "A simple dashboard to track who you've called",
                    ].map((t) => (
                      <Box key={t} sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
                        <CheckIcon sx={{ fontSize: 20, color: tokens.green, mt: "1px" }} />
                        <Typography sx={{ fontSize: 14.5, lineHeight: 1.45 }}>{t}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Button variant="contained" size="large" fullWidth endIcon={<ArrowForwardIcon />} onClick={start} sx={{ mt: 3, bgcolor: ACCENT }}>
                    Get started
                  </Button>
                </Box>
              )}

              {phase === "steps" && (
                <>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Step {i + 1} of {STEPS.length}
                  </Typography>

                  {step === "wants" && (
                    <Question title="What do you want more of?" hint="Pick all that apply.">
                      {WANTS.map((w) => (
                        <Choice key={w} label={w} selected={wants.includes(w)} multi onClick={() => { setError(""); setWants((x) => (x.includes(w) ? x.filter((y) => y !== w) : [...x, w])); }} />
                      ))}
                    </Question>
                  )}

                  {step === "suburbs" && (
                    <Question title="Which areas do you work?" hint="Your best suburbs or towns.">
                      <TextField
                        autoFocus
                        fullWidth
                        placeholder="e.g. Centurion; Eldoraigne; Wierda Park"
                        value={suburbs}
                        onChange={(e) => setSuburbs(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onContinue()}
                      />
                    </Question>
                  )}

                  {step === "budget" && (
                    <Question title="Monthly ad budget you'd be comfortable with?" hint="Ad spend goes to Facebook, not to us. You can change it any time.">
                      {BUDGETS.map((b) => (
                        <Choice
                          key={b}
                          label={b}
                          selected={budget === b}
                          onClick={() => {
                            setBudget(b);
                            // Auto-advance on a single-choice tap, like our lead pages.
                            setTimeout(next, 180);
                          }}
                        />
                      ))}
                    </Question>
                  )}

                  {step === "agency" && (
                    <Question title="Which agency are you with?">
                      <TextField
                        autoFocus
                        fullWidth
                        placeholder="e.g. RE/MAX, Pam Golding, Independent"
                        value={agency}
                        onChange={(e) => setAgency(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onContinue()}
                      />
                    </Question>
                  )}

                  {step === "contact" && (
                    <Question title="Where should we WhatsApp you?">
                      <TextField
                        autoFocus
                        fullWidth
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                      />
                      <TextField
                        fullWidth
                        placeholder="WhatsApp number, e.g. 082 000 0000"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onContinue()}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><WhatsAppIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                      />
                    </Question>
                  )}

                  {error && <Typography sx={{ fontSize: 13, color: tokens.red, mt: 1 }}>{error}</Typography>}

                  {step !== "budget" && (
                    <Button variant="contained" size="large" fullWidth disabled={busy} endIcon={step === "contact" ? undefined : <ArrowForwardIcon />} onClick={onContinue} sx={{ mt: 3, bgcolor: ACCENT }}>
                      {busy ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : step === "contact" ? "Request my free account" : "Next"}
                    </Button>
                  )}
                  {step === "contact" && (
                    <Typography sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.5, mt: 1.5, textAlign: "center" }}>
                      We'll only use your number to set up your account. No spam.{" "}
                      <Box component="a" href="/privacy" target="_blank" rel="noopener" sx={{ color: "text.secondary", textDecoration: "underline" }}>
                        Privacy Policy
                      </Box>
                    </Typography>
                  )}
                  {i > 0 && (
                    <Button onClick={back} startIcon={<ArrowBackIcon fontSize="small" />} sx={{ mt: 1.5, alignSelf: "center", color: "text.secondary", fontSize: 13, textTransform: "none" }}>
                      Previous step
                    </Button>
                  )}
                </>
              )}

              {phase === "done" && (
                <Box sx={{ textAlign: "center", m: "auto 0" }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 56, color: tokens.green }} />
                  <Typography sx={{ fontSize: 22, fontWeight: 700, mt: 1 }}>
                    {saveFailed ? "Almost there" : `You're on the list, ${name.trim().split(" ")[0]}!`}
                  </Typography>
                  <Typography sx={{ fontSize: 14.5, color: "text.secondary", mt: 1, lineHeight: 1.55 }}>
                    {saveFailed
                      ? "We couldn't save your request. Tap below to send it to us on WhatsApp instead."
                      : "We'll WhatsApp you within one working day to set up your account. Want it sooner? Send us your details now."}
                  </Typography>
                  <Box
                    component="a"
                    href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(waMessage)}`}
                    target="_blank"
                    rel="noopener"
                    onClick={() => posthog.capture("signup_whatsapp_clicked", props)}
                    sx={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 1,
                      mt: 3, mx: "auto", maxWidth: 340, bgcolor: "#25D366", color: "#fff",
                      borderRadius: "10px", p: "14px 18px", fontSize: 16, fontWeight: 700,
                      textDecoration: "none", "&:hover": { bgcolor: "#1FB457" },
                    }}
                  >
                    <WhatsAppIcon /> Send on WhatsApp
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{title}</Typography>
      {hint && <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 0.5 }}>{hint}</Typography>}
      <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>{children}</Box>
    </Box>
  );
}

function Choice({ label, selected, multi, onClick }: { label: string; selected: boolean; multi?: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        display: "flex", alignItems: "center", gap: 1.25, width: "100%", textAlign: "left",
        p: "14px 16px", borderRadius: "8px", cursor: "pointer", font: "inherit", fontSize: 15,
        border: `1.5px solid ${selected ? ACCENT : "#dadce0"}`,
        bgcolor: selected ? "#e8f0fe" : "#fff",
        color: tokens.ink,
        transition: "border-color .12s, background-color .12s",
        "&:hover": { borderColor: ACCENT },
      }}
    >
      <Box
        sx={{
          width: 20, height: 20, flexShrink: 0, borderRadius: multi ? "4px" : "50%",
          border: `2px solid ${selected ? ACCENT : "#9aa0a6"}`, bgcolor: selected ? ACCENT : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {selected && <CheckIcon sx={{ fontSize: 14, color: "#fff" }} />}
      </Box>
      {label}
    </Box>
  );
}
