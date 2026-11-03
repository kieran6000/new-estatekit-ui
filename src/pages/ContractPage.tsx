import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Checkbox, FormControlLabel, TextField } from "@mui/material";
import { reportReading, sendSigningCode, signContract, viewContract, type SharedContract } from "../api/contracts";
import ContractSheet from "../components/ContractSheet";
import SignaturePad from "../components/SignaturePad";

// The client's contract: /c/<token>, the link the team sends on WhatsApp. No
// sign-in. They read it and sign it here: their name, their signature, and a
// code sent to their WhatsApp, which is what ties the signature to them. Time
// on the page and how far they've read go to the team (the contract says so).

const REPORT_EVERY_MS = 15_000;
const INK = "#14181f";
const firmButton = { bgcolor: INK, color: "#fff", py: 1.25, fontSize: 15, boxShadow: "none", "&:hover": { bgcolor: "#2b323d", boxShadow: "none" } };

/** One visit: a refresh isn't a new open, coming back later is. */
function visitId(): string {
  try {
    const saved = sessionStorage.getItem("ek-contract-visit");
    if (saved) return saved;
    const id = crypto.randomUUID();
    sessionStorage.setItem("ek-contract-visit", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Reports time actually spent looking at the page, and the furthest read, as
 *  a fraction of the wording. Also what the thin bar at the top shows. */
function useReading(token: string, enabled: boolean, clauses: HTMLElement | null, session: string) {
  const [progress, setProgress] = useState(0);
  const seconds = useRef(0);
  const furthest = useRef(0);
  const reported = useRef(0);

  useEffect(() => {
    if (!clauses) return;
    const measure = () => {
      const r = clauses.getBoundingClientRect();
      const pct = Math.round(Math.min(1, Math.max(0, (window.innerHeight - r.top) / r.height)) * 100);
      if (pct > furthest.current) furthest.current = pct;
      setProgress(pct);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [clauses]);

  useEffect(() => {
    if (!enabled) return;
    const send = () => {
      if (!seconds.current && furthest.current === reported.current) return;
      reportReading(token, session, seconds.current, furthest.current);
      seconds.current = 0;
      reported.current = furthest.current;
    };
    const tick = setInterval(() => { if (document.visibilityState === "visible") seconds.current++; }, 1000);
    const report = setInterval(send, REPORT_EVERY_MS);
    const leaving = () => { if (document.visibilityState === "hidden") send(); };
    document.addEventListener("visibilitychange", leaving);
    window.addEventListener("pagehide", send);
    return () => {
      clearInterval(tick);
      clearInterval(report);
      document.removeEventListener("visibilitychange", leaving);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [enabled, token, session]);

  return progress;
}

function SigningForm({ token, session, signerName, onSigned }: { token: string; session: string; signerName: string; onSigned: () => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().split(/\s+/).length >= 2 && !!signature && agreed;
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendCode = () => run(async () => {
    const { maskedPhone } = await sendSigningCode(token);
    setSentTo(maskedPhone);
  });
  const sign = () => run(async () => {
    await signContract({ token, session, name, signature: signature!, code });
    await onSigned();
    window.scrollTo({ top: 0 });
  });

  return (
    <div className="ct-form">
      <p className="ct-sub" style={{ marginTop: 0 }}>Sign below to accept this agreement. It's binding once signed.</p>

      <label className="ct-form-label" htmlFor="ct-name">Your full name</label>
      <TextField id="ct-name" fullWidth placeholder={signerName} value={name} onChange={(e) => setName(e.target.value)} disabled={!!sentTo} autoComplete="name" sx={{ mb: 2.5 }} />

      <span className="ct-form-label">Your signature</span>
      <SignaturePad value={signature} onChange={setSignature} disabled={!!sentTo} />

      <FormControlLabel
        sx={{ mt: 1.5, mb: 1.5, alignItems: "flex-start", mr: 0, "& .MuiFormControlLabel-label": { fontSize: 15 } }}
        control={<Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={!!sentTo} sx={{ mt: -0.75, color: INK, "&.Mui-checked": { color: INK } }} />}
        label="I have read this agreement and I agree to it. I understand my electronic signature has the same effect as signing by hand."
      />

      {!sentTo ? (
        <>
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <Button fullWidth variant="contained" sx={firmButton} disabled={!ready || busy} onClick={sendCode}>
            {busy ? "Sending your code…" : "Continue"}
          </Button>
          <p className="ct-note">Next, we'll send a code to your WhatsApp to confirm it's you.</p>
        </>
      ) : (
        <>
          <label className="ct-form-label" htmlFor="ct-code">Type the 6-digit code we sent to your WhatsApp number ending in {sentTo.slice(-4)}</label>
          <TextField
            id="ct-code"
            fullWidth
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoComplete="one-time-code"
            slotProps={{ htmlInput: { inputMode: "numeric", style: { fontSize: 24, letterSpacing: "0.3em", fontWeight: 500 } } }}
            sx={{ mb: 1.5 }}
          />
          {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
          <Button fullWidth variant="contained" sx={firmButton} disabled={code.length !== 6 || busy} onClick={sign}>
            {busy ? "Signing…" : "Sign agreement"}
          </Button>
          <Button fullWidth sx={{ mt: 0.75, color: INK }} disabled={busy} onClick={sendCode}>Send a new code</Button>
          <p className="ct-note">Not your number, or no code after a minute? Contact EstateKit before signing.</p>
        </>
      )}
      <p className="ct-note">We record when you open and sign this agreement, and the device and internet address used, as proof of signature.</p>
    </div>
  );
}

export default function ContractPage() {
  const { token = "" } = useParams();
  const [session] = useState(visitId);
  const [clauses, setClauses] = useState<HTMLElement | null>(null);
  const { data, isLoading, isError, refetch } = useQuery<SharedContract | null>({
    queryKey: ["contract", token],
    queryFn: () => viewContract(token, session),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const live = data && data.status !== "cancelled" ? data : null;
  const progress = useReading(token, !!live && !live.staff, clauses, session);

  useEffect(() => {
    if (data) document.title = `${data.title} · ${data.reference}`;
  }, [data]);

  if (!data) {
    const heading = isLoading ? "Loading your agreement…" : isError ? "We couldn't load this agreement" : "This link isn't valid";
    const detail = isLoading ? "" : isError ? "Check your signal and refresh the page." : "Ask your EstateKit contact for a new one.";
    return (
      <div className="ct-viewer">
        <div className="ct-message" role="status"><h1>{heading}</h1>{detail && <p>{detail}</p>}</div>
      </div>
    );
  }
  if (data.status === "cancelled") {
    return (
      <div className="ct-viewer">
        <div className="ct-message">
          <span className="ct-label">Reference {data.reference}</span>
          <h1 style={{ marginTop: 8 }}>This agreement has been cancelled</h1>
          <p>It can't be signed any more. Ask your EstateKit contact if you were expecting it.</p>
        </div>
      </div>
    );
  }

  const unsigned = data.status === "open";
  return (
    <div className="ct-viewer">
      {unsigned && !data.staff && <div className="ct-progress" aria-hidden><div style={{ width: `${progress}%` }} /></div>}
      {data.staff && <div className="ct-banner">You're viewing this as EstateKit staff, so this visit isn't logged and you can't sign it here.</div>}
      {!unsigned && (
        <div className="ct-banner ct-signed-banner">
          Signed agreement. Keep this link for your records.
          <Button size="small" sx={{ ml: 1, color: INK }} onClick={() => window.print()}>Save as PDF</Button>
        </div>
      )}
      <ContractSheet
        doc={data.document}
        reference={data.reference}
        issuedAt={data.issuedAt}
        issuedBy={data.issuedBy}
        documentHash={data.documentHash}
        signed={data.signed}
        clausesRef={setClauses}
        signing={data.staff
          ? <p className="ct-note">The client signs here.</p>
          : <SigningForm token={token} session={session} signerName={data.signerName} onSigned={refetch} />}
      />
      {unsigned && !data.staff && progress < 100 && (
        <div className="ct-bar">
          <div className="ct-bar-inner">
            <span>{data.reference}. Please read, then sign at the end.</span>
            <Button size="small" sx={{ color: INK, whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => document.getElementById("sign")?.scrollIntoView({ behavior: "smooth" })}>Go to signature</Button>
          </div>
        </div>
      )}
    </div>
  );
}
