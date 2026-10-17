import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, CircularProgress, InputAdornment, LinearProgress, TextField, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import LocationCityOutlinedIcon from "@mui/icons-material/LocationCityOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import AddAPhotoOutlinedIcon from "@mui/icons-material/AddAPhotoOutlined";
import ContactPhoneOutlinedIcon from "@mui/icons-material/ContactPhoneOutlined";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import GroupAddOutlinedIcon from "@mui/icons-material/GroupAddOutlined";
import LanguageIcon from "@mui/icons-material/Language";
import { tokens } from "../theme";
import { submitOnboarding } from "../api/onboarding";
import { ADMIN_WHATSAPP } from "../lib/contact";
import { MAX_IMAGE_BYTES, shrinkImage } from "../lib/image";
import type { Place } from "../lib/places";
import { ACCENT, Choice, CityPicker, MAX_SUBURBS, Question, SuburbPicker } from "../components/FunnelSteps";
import estateKitLogoWhite from "../assets/whitelogofull.png";

// The onboarding form for new clients, after they've said yes on the call.
// It replaces the "EstateKit Onboarding" Google Form: the same answers, but
// one question per screen, mostly taps (like /start and our lead pages),
// contact details last. Sending it creates their account and sends their
// login (submit-onboarding), then shows "what happens next" (/onboarding/next).

const CAMPAIGNS: { label: string; icon: ReactNode }[] = [
  { label: "Sellers", icon: <SellOutlinedIcon /> },
  { label: "Buyers", icon: <KeyOutlinedIcon /> },
  { label: "Sellers and buyers", icon: <SwapHorizOutlinedIcon /> },
  { label: "Agents to recruit", icon: <GroupAddOutlinedIcon /> },
];
const PRICES = ["Under R1 million", "R1 – R2 million", "R2 – R4 million", "Over R4 million"];
const DEALS = ["None yet", "1 – 2", "3 – 5", "6 or more"];

type Step = "campaign" | "city" | "suburbs" | "price" | "deals" | "agency" | "address" | "offer" | "photos" | "contact";
const STEPS: Step[] = ["campaign", "city", "suburbs", "price", "deals", "agency", "address", "offer", "photos", "contact"];
const ICON: Record<Step, ReactNode> = {
  campaign: <TrackChangesIcon />,
  city: <LocationCityOutlinedIcon />,
  suburbs: <PlaceOutlinedIcon />,
  price: <PaymentsOutlinedIcon />,
  deals: <HandshakeOutlinedIcon />,
  agency: <BusinessOutlinedIcon />,
  address: <HomeWorkOutlinedIcon />,
  offer: <LocalOfferOutlinedIcon />,
  photos: <AddAPhotoOutlinedIcon />,
  contact: <ContactPhoneOutlinedIcon />,
};
/** Steps with typing (or optional ones) get a Next button; the rest move on when tapped. */
const NEEDS_NEXT: Step[] = ["suburbs", "agency", "address", "offer", "photos", "contact"];

// Progress is kept on their phone as they go, so someone who gets
// distracted halfway comes back to the question they were on. Cleared once
// the form is sent; forgotten after 30 days. Storage can be blocked (private
// windows): then the form just works without it.
const DRAFT_KEY = "ek_onboarding_draft";
const DRAFT_DAYS = 30;
interface Draft {
  i: number; campaign: string; city: Place | null; suburbs: string[]; price: string; deals: string; agency: string; website: string;
  address: string; offer: string; headshot: string; logo: string; name: string; email: string; phone: string; savedAt: number;
}
function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") as Draft | null;
    if (!d || typeof d.i !== "number" || Date.now() - (d.savedAt || 0) > DRAFT_DAYS * 86_400_000) return null;
    return d;
  } catch {
    return null;
  }
}
function saveDraft(d: Omit<Draft, "savedAt">) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    // Full or blocked: try again without the pictures (the biggest part).
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, headshot: "", logo: "", savedAt: Date.now() })); } catch { /* fine */ }
  }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* fine */ }
}

const phoneIsValid = (v: string) => { const d = v.replace(/\D/g, ""); return d.length >= 9 && d.length <= 13; };
const emailIsValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

export default function OnboardingPage() {
  const navigate = useNavigate();
  // Came back to a half-done form: straight to the question they were on.
  const [draft] = useState(loadDraft);
  const [resumed, setResumed] = useState(!!draft);
  const [phase, setPhase] = useState<"intro" | "steps" | "done" | "failed">(draft ? "steps" : "intro");
  const [i, setI] = useState(draft ? Math.min(Math.max(0, draft.i), STEPS.length - 1) : 0);
  const [campaign, setCampaign] = useState(draft?.campaign ?? "");
  const [city, setCity] = useState<Place | null>(draft?.city ?? null);
  const [suburbs, setSuburbs] = useState<string[]>(draft?.suburbs ?? []);
  const [price, setPrice] = useState(draft?.price ?? "");
  const [deals, setDeals] = useState(draft?.deals ?? "");
  const [agency, setAgency] = useState(draft?.agency ?? "");
  const [website, setWebsite] = useState(draft?.website ?? "");
  const [address, setAddress] = useState(draft?.address ?? "");
  const [offer, setOffer] = useState(draft?.offer ?? "");
  const [headshot, setHeadshot] = useState(draft?.headshot ?? "");
  const [logo, setLogo] = useState(draft?.logo ?? "");
  const [name, setName] = useState(draft?.name ?? "");
  const [email, setEmail] = useState(draft?.email ?? "");
  const [phone, setPhone] = useState(draft?.phone ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<"created" | "existing" | "failed">("created");
  const step = STEPS[i];
  const first = name.trim().split(/\s+/)[0] || "";

  useEffect(() => { document.title = "EstateKit onboarding"; }, []);

  // Every answer, as they go.
  useEffect(() => {
    if (phase !== "steps") return;
    saveDraft({ i, campaign, city, suburbs, price, deals, agency, website, address, offer, headshot, logo, name, email, phone });
  }, [phase, i, campaign, city, suburbs, price, deals, agency, website, address, offer, headshot, logo, name, email, phone]);

  function startOver() {
    clearDraft();
    setResumed(false);
    setI(0); setCampaign(""); setCity(null); setSuburbs([]); setPrice(""); setDeals(""); setAgency(""); setWebsite("");
    setAddress(""); setOffer(""); setHeadshot(""); setLogo(""); setName(""); setEmail(""); setPhone(""); setError("");
    setPhase("intro");
  }

  const goTo = (n: number) => { setError(""); setI(Math.max(0, Math.min(n, STEPS.length - 1))); };
  /** Single-choice steps: show the tick, then move on by themselves. */
  function pickAndAdvance(apply: () => void) {
    apply();
    const at = i;
    setTimeout(() => { setI((cur) => (cur === at ? cur + 1 : cur)); setError(""); }, 200);
  }

  async function onNext() {
    if (step === "suburbs" && !suburbs.length) return setError("Add at least one area.");
    if (step === "agency" && agency.trim().length < 2) return setError("Add your agency (or \"Independent\").");
    if (step === "address" && address.trim().length < 5) return setError("Add your business address.");
    if (step !== "contact") return goTo(i + 1);
    if (name.trim().length < 2) return setError("Add your full name.");
    if (!emailIsValid(email)) return setError("That email address doesn't look right.");
    if (!phoneIsValid(phone)) return setError("That WhatsApp number doesn't look right.");
    setBusy(true);
    try {
      const r = await submitOnboarding({
        name: name.trim(), email: email.trim(), phone: phone.trim(), agency: agency.trim(), website: website.trim(), address: address.trim(),
        campaign, city: city?.name ?? "", suburbs, price, deals, offer: offer.trim(), headshot, logo,
      });
      setAccount(r.account);
      clearDraft();
      setPhase("done");
      // "Got your details", then on to the video.
      setTimeout(() => navigate(`/onboarding/next?t=${r.token}&n=${encodeURIComponent(first)}`), 4000);
    } catch (e) {
      console.error(e);
      setPhase("failed");
    } finally {
      setBusy(false);
    }
  }

  const waMessage =
    `Hi EstateKit, here are my onboarding details.\n\nName: ${name.trim()}\nEmail: ${email.trim()}\nAgency: ${agency.trim()}\nCampaign: ${campaign}\n` +
    `Areas: ${[city?.name, suburbs.join(", ")].filter(Boolean).join(": ")}\nPrice range: ${price}\nDeals (6 months): ${deals}`;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ bgcolor: ACCENT, p: "14px 20px", textAlign: "center" }}>
        <Box component="img" src={estateKitLogoWhite} alt="EstateKit" sx={{ height: 28, width: "auto", display: "inline-block", verticalAlign: "middle" }} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <Box sx={{ width: "100%", maxWidth: 480, mt: 2.5 }}>
          <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
            {phase === "steps" && (
              <LinearProgress variant="determinate" value={((i + 1) / STEPS.length) * 100} sx={{ height: 4, bgcolor: "#eee", "& .MuiLinearProgress-bar": { bgcolor: ACCENT } }} />
            )}

            <Box sx={{ p: "28px 24px", minHeight: 300, display: "flex", flexDirection: "column" }}>
              {phase === "intro" && (
                <Box sx={{ m: "auto 0", textAlign: "center" }}>
                  <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>Welcome to EstateKit!</Typography>
                  <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1, lineHeight: 1.5 }}>
                    A few quick questions so we can set up your campaign and your account. Takes about 3 minutes.
                  </Typography>
                  <Button variant="contained" size="large" fullWidth endIcon={<ArrowForwardIcon />} onClick={() => setPhase("steps")} sx={{ mt: 3, bgcolor: ACCENT }}>
                    Let&apos;s start
                  </Button>
                </Box>
              )}

              {phase === "steps" && (
                <>
                  {resumed && (
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.5, p: "8px 12px", borderRadius: "8px", bgcolor: "#e8f0fe", fontSize: 13.5 }}>
                      <span>Welcome back! We kept your answers.</span>
                      <Box component="button" type="button" onClick={startOver} sx={{ border: 0, bgcolor: "transparent", p: 0, font: "inherit", fontSize: 13, color: ACCENT, textDecoration: "underline", cursor: "pointer", whiteSpace: "nowrap" }}>
                        Start over
                      </Box>
                    </Box>
                  )}
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Step {i + 1} of {STEPS.length}
                  </Typography>

                  {step === "campaign" && (
                    <Question icon={ICON.campaign} title="What do you want leads for?">
                      {CAMPAIGNS.map((c) => <Choice key={c.label} label={c.label} icon={c.icon} selected={campaign === c.label} onClick={() => pickAndAdvance(() => setCampaign(c.label))} />)}
                    </Question>
                  )}

                  {step === "city" && (
                    <Question icon={ICON.city} title="Which city or town do you work in?">
                      <CityPicker value={city} onPick={(p) => pickAndAdvance(() => { if (p.name !== city?.name) setSuburbs([]); setCity(p); })} />
                    </Question>
                  )}

                  {step === "suburbs" && (
                    <Question icon={ICON.suburbs} title={`Your top ${MAX_SUBURBS} areas to target`} hint="Where your ads will run.">
                      <SuburbPicker city={city} value={suburbs} onChange={(v) => { setError(""); setSuburbs(v); }} />
                    </Question>
                  )}

                  {step === "price" && (
                    <Question icon={ICON.price} title="Average home price in your area?">
                      {PRICES.map((p) => <Choice key={p} label={p} selected={price === p} onClick={() => pickAndAdvance(() => setPrice(p))} />)}
                    </Question>
                  )}

                  {step === "deals" && (
                    <Question icon={ICON.deals} title="How many deals have you closed in the last 6 months?">
                      {DEALS.map((d) => <Choice key={d} label={d} selected={deals === d} onClick={() => pickAndAdvance(() => setDeals(d))} />)}
                    </Question>
                  )}

                  {step === "agency" && (
                    <Question icon={ICON.agency} title="Your agency">
                      <TextField autoFocus fullWidth label="Agency or brokerage" placeholder="e.g. RE/MAX, Pam Golding, Independent" value={agency} onChange={(e) => setAgency(e.target.value)} />
                      <TextField
                        fullWidth
                        label="Website (if you have one)"
                        placeholder="e.g. www.youragency.co.za"
                        inputMode="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onNext()}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><LanguageIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }}
                      />
                    </Question>
                  )}

                  {step === "address" && (
                    <Question icon={ICON.address} title="Your business address" hint="Your office, as you'd like it on your page.">
                      <TextField autoFocus fullWidth multiline minRows={2} placeholder="e.g. 12 Main Road, Centurion, 0157" value={address} onChange={(e) => setAddress(e.target.value)} />
                    </Question>
                  )}

                  {step === "offer" && (
                    <Question icon={ICON.offer} title="Any special offer you'd like in your ads?" hint="Optional. E.g. cash back, “we'll buy your home if we can't sell it”, a free valuation report.">
                      <TextField autoFocus fullWidth multiline minRows={3} placeholder="Leave blank if not" value={offer} onChange={(e) => setOffer(e.target.value)} />
                    </Question>
                  )}

                  {step === "photos" && (
                    <Question icon={ICON.photos} title="Your photo and logo" hint="Optional. Used on your lead pages. You can add them later too.">
                      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                        <ImagePick label="Your photo" round value={headshot} kind="photo" onChange={setHeadshot} onError={setError} />
                        <ImagePick label="Logo" value={logo} kind="logo" onChange={setLogo} onError={setError} />
                      </Box>
                    </Question>
                  )}

                  {step === "contact" && (
                    <Question icon={ICON.contact} title="Where should we send your login?">
                      <TextField autoFocus fullWidth placeholder="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><PersonOutlineIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }} />
                      <TextField fullWidth type="email" placeholder="Email address" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }} />
                      <TextField fullWidth placeholder="WhatsApp number, e.g. 082 000 0000" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onNext()}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><WhatsAppIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment> } }} />
                    </Question>
                  )}

                  {error && <Typography sx={{ fontSize: 13, color: tokens.red, mt: 1 }}>{error}</Typography>}

                  {NEEDS_NEXT.includes(step) && (
                    <Button variant="contained" size="large" fullWidth disabled={busy} endIcon={step === "contact" || busy ? undefined : <ArrowForwardIcon />} onClick={onNext} sx={{ mt: 3, bgcolor: ACCENT }}>
                      {busy ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : step === "contact" ? "Send and create my account" : (step === "offer" && !offer.trim()) || (step === "photos" && !headshot && !logo) ? "Skip" : "Next"}
                    </Button>
                  )}
                  {step === "contact" && (
                    <Typography sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.5, mt: 1.5, textAlign: "center" }}>
                      Your login comes by WhatsApp and email.{" "}
                      <Box component="a" href="/privacy" target="_blank" rel="noopener" sx={{ color: "text.secondary", textDecoration: "underline" }}>Privacy Policy</Box>
                    </Typography>
                  )}
                  {i > 0 && (
                    <Button onClick={() => goTo(i - 1)} startIcon={<ArrowBackIcon fontSize="small" />} sx={{ mt: 1.5, alignSelf: "center", color: "text.secondary", fontSize: 13 }}>
                      Previous step
                    </Button>
                  )}
                </>
              )}

              {phase === "done" && (
                <Box sx={{ textAlign: "center", m: "auto 0" }}>
                  <CheckCircleOutlineIcon sx={{ fontSize: 56, color: tokens.green }} />
                  <Typography sx={{ fontSize: 22, fontWeight: 700, mt: 1 }}>Got your details{first ? `, ${first}` : ""}!</Typography>
                  <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1, lineHeight: 1.55 }}>
                    {account === "created"
                      ? "Your account is ready. Your login is on its way to your WhatsApp and email."
                      : account === "existing"
                        ? "You already have an account with this number, so log in as usual."
                        : "We'll send you your login shortly."}
                  </Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 3 }}>Taking you to the next step…</Typography>
                  <LinearProgress sx={{ mt: 1.25, height: 4, borderRadius: 2, bgcolor: "#eee", "& .MuiLinearProgress-bar": { bgcolor: ACCENT } }} />
                </Box>
              )}

              {phase === "failed" && (
                <Box sx={{ textAlign: "center", m: "auto 0" }}>
                  <Typography sx={{ fontSize: 22, fontWeight: 700 }}>Almost there</Typography>
                  <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1, lineHeight: 1.55 }}>
                    We couldn&apos;t send your details. Tap below to send them to us on WhatsApp instead.
                  </Typography>
                  <Box component="a" href={`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(waMessage)}`} target="_blank" rel="noopener"
                    sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mt: 3, mx: "auto", maxWidth: 340, bgcolor: "#25D366", color: "#fff", borderRadius: "10px", p: "14px 18px", fontSize: 16, fontWeight: 700, textDecoration: "none", "&:hover": { bgcolor: "#1FB457" } }}>
                    <WhatsAppIcon /> Send on WhatsApp
                  </Box>
                  <Button onClick={() => setPhase("steps")} sx={{ mt: 1.5, color: "text.secondary" }}>Try again</Button>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** A tap-to-add picture (camera or gallery), shrunk before it's sent. */
function ImagePick({ label, round, value, kind, onChange, onError }: { label: string; round?: boolean; value: string; kind: "photo" | "logo"; onChange: (v: string) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return onError("That isn't a picture. Choose a photo.");
    if (file.size > MAX_IMAGE_BYTES) return onError("That picture is too big. Choose another one.");
    setBusy(true);
    onError("");
    try {
      onChange(await toDataUrl(await shrinkImage(file, kind)));
    } catch {
      onError("Couldn't read that picture. Try another one.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <Box
      component="button"
      type="button"
      onClick={() => input.current?.click()}
      sx={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, p: 2, minHeight: 150,
        border: `1.5px dashed ${value ? ACCENT : "#bdc1c6"}`, borderRadius: "10px", bgcolor: value ? "#e8f0fe" : "#fff", cursor: "pointer", font: "inherit", color: tokens.ink,
      }}
    >
      {busy ? (
        <CircularProgress size={28} />
      ) : value ? (
        <Box component="img" src={value} alt="" sx={{ width: round ? 84 : "100%", height: 84, objectFit: round ? "cover" : "contain", borderRadius: round ? "50%" : "6px" }} />
      ) : (
        <AddAPhotoOutlinedIcon sx={{ fontSize: 34, color: "#5f6368" }} />
      )}
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{value ? "Tap to change" : "Tap to add"}</Typography>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </Box>
  );
}
