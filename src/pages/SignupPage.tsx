import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Button, CircularProgress, InputAdornment, LinearProgress, TextField, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import LocationCityOutlinedIcon from "@mui/icons-material/LocationCityOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ContactPhoneOutlinedIcon from "@mui/icons-material/ContactPhoneOutlined";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import { tokens } from "../theme";
import { requestSignup } from "../api/signup";
import { ADMIN_WHATSAPP } from "../lib/contact";
import type { Place } from "../lib/places";
import { ACCENT, Choice, CityPicker, MAX_SUBURBS, Question, SuburbPicker } from "../components/FunnelSteps";
import estateKitLogoWhite from "../assets/whitelogofull.png";

// The public "get a free account" form, reached from the "Powered by
// EstateKit" link on clients' lead pages. Built for completion rate: short
// steps, mostly taps (every single-choice step moves on by itself), contact
// details last like our lead pages, and only what we need to call them back
// and plan their first campaign. Facebook access, photos, recent sales etc.
// are collected at onboarding.


const WANTS: { label: string; value: string[]; icon: ReactNode }[] = [
  { label: "Sellers", value: ["Sellers"], icon: <SellOutlinedIcon /> },
  { label: "Buyers", value: ["Buyers"], icon: <KeyOutlinedIcon /> },
  { label: "Both sellers and buyers", value: ["Sellers", "Buyers"], icon: <SwapHorizOutlinedIcon /> },
  { label: "Agents to recruit", value: ["Agents to recruit"], icon: <GroupAddOutlinedIcon /> },
];
const BUDGETS = ["Under R2 000", "R2 000 – R5 000", "R5 000+", "Not sure yet"];

type Step = "wants" | "city" | "suburbs" | "budget" | "agency" | "contact";
const STEPS: Step[] = ["wants", "city", "suburbs", "budget", "agency", "contact"];
const STEP_ICON: Record<Step, ReactNode> = {
  wants: <TrackChangesIcon />,
  city: <LocationCityOutlinedIcon />,
  suburbs: <PlaceOutlinedIcon />,
  budget: <PaymentsOutlinedIcon />,
  agency: <BusinessOutlinedIcon />,
  contact: <ContactPhoneOutlinedIcon />,
};

function phoneIsValid(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length >= 9 && d.length <= 13;
}
const emailIsValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function SignupPage() {
  const [params] = useSearchParams();
  const ref = params.get("ref");
  const from = params.get("from");
  const posthog = usePostHog();

  const [phase, setPhase] = useState<"intro" | "steps" | "done">("intro");
  const [i, setI] = useState(0);
  const [wants, setWants] = useState<string>("");
  const [city, setCity] = useState<Place | null>(null);
  const [suburbs, setSuburbs] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [agency, setAgency] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
    document.title = "Get a free EstateKit account";
    posthog.register({ signup_from: from, signup_ref: ref });
    posthog.capture("signup_viewed", props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start() {
    posthog.capture("signup_started", props);
    setPhase("steps");
  }

  function goTo(nextIndex: number) {
    setError("");
    setI(Math.max(0, Math.min(nextIndex, STEPS.length - 1)));
  }

  function completeStep(extra: Record<string, unknown> = {}) {
    posthog.capture("signup_step_completed", { ...props, step, index: i + 1, ...extra });
    goTo(i + 1);
  }

  /** Single-choice steps: show the tick, then move on by themselves. */
  function pickAndAdvance(apply: () => void, extra: Record<string, unknown> = {}) {
    apply();
    const at = i;
    setTimeout(() => {
      setI((cur) => (cur === at ? cur + 1 : cur));
      setError("");
      posthog.capture("signup_step_completed", { ...props, step: STEPS[at], index: at + 1, ...extra });
    }, 200);
  }

  async function onContinue() {
    if (step === "suburbs") {
      if (!suburbs.length) return setError("Add at least one suburb.");
      return completeStep({ suburbs: suburbs.length });
    }
    if (step === "agency") {
      if (agency.trim().length < 2) return setError("Add your agency (or \"Independent\").");
      return completeStep();
    }
    if (step !== "contact") return;
    if (name.trim().length < 2) return setError("Add your name.");
    if (!emailIsValid(email)) return setError("That email address doesn't look right.");
    if (!phoneIsValid(phone)) return setError("That WhatsApp number doesn't look right.");
    setBusy(true);
    try {
      await requestSignup({
        name: name.trim(),
        whatsapp: phone,
        email: email.trim(),
        agency: agency.trim(),
        wants: WANTS.find((w) => w.label === wants)?.value ?? [],
        city: city?.name ?? "",
        suburbs,
        budget,
        ref,
        source: from,
      });
      posthog.capture("signup_submitted", { ...props, wants, budget, city: city?.name ?? null, suburbs: suburbs.length });
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
    `Name: ${name.trim()}\nEmail: ${email.trim()}\nAgency: ${agency.trim()}\nLooking for: ${wants}\n` +
    `Area: ${[city?.name, suburbs.join(", ")].filter(Boolean).join(": ")}\nAd budget: ${budget}`;

  const showNext = step === "suburbs" || step === "agency" || step === "contact";

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

            <Box sx={{ p: "28px 24px", minHeight: 300, display: "flex", flexDirection: "column" }}>
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
                    <Question icon={STEP_ICON.wants} title="What do you want more of?">
                      {WANTS.map((w) => (
                        <Choice key={w.label} label={w.label} icon={w.icon} selected={wants === w.label} onClick={() => pickAndAdvance(() => setWants(w.label), { wants: w.label })} />
                      ))}
                    </Question>
                  )}

                  {step === "city" && (
                    <Question icon={STEP_ICON.city} title="Which city or town do you work in?" hint="We'll use it in your ads, e.g. “Selling in Centurion?”">
                      <CityPicker
                        value={city}
                        onPick={(p) => pickAndAdvance(() => {
                          // A different city means different suburbs.
                          if (p.name !== city?.name) setSuburbs([]);
                          setCity(p);
                        }, { city: p.name })}
                      />
                    </Question>
                  )}

                  {step === "suburbs" && (
                    <Question icon={STEP_ICON.suburbs} title={`Your top suburbs${city ? ` in ${city.name}` : ""}`} hint={`Pick up to ${MAX_SUBURBS}. These are where your ads will run.`}>
                      <SuburbPicker city={city} value={suburbs} onChange={(v) => { setError(""); setSuburbs(v); }} />
                    </Question>
                  )}

                  {step === "budget" && (
                    <Question icon={STEP_ICON.budget} title="Monthly ad budget you'd be comfortable with?" hint="Ad spend goes to Facebook, not to us. You can change it any time.">
                      {BUDGETS.map((b) => (
                        <Choice key={b} label={b} selected={budget === b} onClick={() => pickAndAdvance(() => setBudget(b), { budget: b })} />
                      ))}
                    </Question>
                  )}

                  {step === "agency" && (
                    <Question icon={STEP_ICON.agency} title="Which agency are you with?">
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
                    <Question icon={STEP_ICON.contact} title="Where should we send your login?">
                      <TextField
                        autoFocus
                        fullWidth
                        placeholder="Your name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                      />
                      <TextField
                        fullWidth
                        type="email"
                        placeholder="Email address"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                      />
                      <TextField
                        fullWidth
                        placeholder="WhatsApp number, e.g. 082 000 0000"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onContinue()}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><WhatsAppIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                      />
                    </Question>
                  )}

                  {error && <Typography sx={{ fontSize: 13, color: tokens.red, mt: 1 }}>{error}</Typography>}

                  {showNext && (
                    <Button variant="contained" size="large" fullWidth disabled={busy} endIcon={step === "contact" ? undefined : <ArrowForwardIcon />} onClick={onContinue} sx={{ mt: 3, bgcolor: ACCENT }}>
                      {busy ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : step === "contact" ? "Request my free account" : "Next"}
                    </Button>
                  )}
                  {step === "contact" && (
                    <Typography sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.5, mt: 1.5, textAlign: "center" }}>
                      We'll only use your details to set up your account. No spam.{" "}
                      <Box component="a" href="/privacy" target="_blank" rel="noopener" sx={{ color: "text.secondary", textDecoration: "underline" }}>
                        Privacy Policy
                      </Box>
                    </Typography>
                  )}
                  {i > 0 && (
                    <Button onClick={() => goTo(i - 1)} startIcon={<ArrowBackIcon fontSize="small" />} sx={{ mt: 1.5, alignSelf: "center", color: "text.secondary", fontSize: 13, textTransform: "none" }}>
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
                      : "We'll WhatsApp you within one working day to set up your account. Want it sooner? Message us now."}
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
                    <WhatsAppIcon /> Message us on WhatsApp
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
