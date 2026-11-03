import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { reportReading, signContract, viewContract, type SharedContract } from "../api/contracts";
import ContractSheet from "../components/ContractSheet";
import SignDialog from "../components/SignDialog";

// The client's contract: /c/<token>, the link the team sends on WhatsApp. No
// sign-in. It opens like a PDF. They tap the one Sign button or the marked place
// on the page, sign in a small window, and it's done. Time on the page and how
// far they've read go to the team (the contract says so).

const REPORT_EVERY_MS = 15_000;

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

/** Reports time actually spent looking at the page and the furthest read, and
 *  says which page is on screen, for the bar at the top. */
function useReading(token: string, track: boolean, pages: HTMLElement | null, session: string) {
  const [page, setPage] = useState({ at: 1, of: 1 });
  const seconds = useRef(0);
  const furthest = useRef(0);
  const reported = useRef(0);

  useEffect(() => {
    if (!pages) return;
    const measure = () => {
      const r = pages.getBoundingClientRect();
      const pct = Math.round(Math.min(1, Math.max(0, (window.innerHeight - r.top) / r.height)) * 100);
      if (pct > furthest.current) furthest.current = pct;
      const sheets = [...pages.querySelectorAll("article.ct-page")];
      const at = sheets.filter((s) => s.getBoundingClientRect().top < window.innerHeight / 2).length;
      setPage({ at: Math.max(1, at), of: Math.max(1, sheets.length) });
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const watcher = new MutationObserver(measure);
    watcher.observe(pages, { childList: true });
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      watcher.disconnect();
    };
  }, [pages]);

  useEffect(() => {
    if (!track) return;
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
  }, [track, token, session]);

  return page;
}

export default function ContractPage() {
  const { token = "" } = useParams();
  const [session] = useState(visitId);
  const [pages, setPages] = useState<HTMLElement | null>(null);
  const [signing, setSigning] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<SharedContract | null>({
    queryKey: ["contract", token],
    queryFn: () => viewContract(token, session),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const live = data && data.status !== "cancelled" ? data : null;
  const page = useReading(token, !!live && !live.staff, pages, session);

  useEffect(() => {
    if (data) document.title = `${data.title} · ${data.reference}`;
  }, [data]);

  if (!data) {
    const heading = isLoading ? "Opening your agreement…" : isError ? "We couldn't open this agreement" : "This link isn't valid";
    const detail = isLoading ? "" : isError ? "Check your signal and refresh the page." : "Ask your EstateKit contact for a new one.";
    return (
      <div className="ct-viewer ct-done">
        <div className="ct-message" role="status"><h1>{heading}</h1>{detail && <p>{detail}</p>}</div>
      </div>
    );
  }
  if (data.status === "cancelled") {
    return (
      <div className="ct-viewer ct-done">
        <div className="ct-message">
          <h1>This agreement has been cancelled</h1>
          <p>Reference {data.reference}. It can't be signed any more. Ask your EstateKit contact if you were expecting it.</p>
        </div>
      </div>
    );
  }

  const canSign = data.status === "open" && !data.staff;
  const sign = async (name: string, signature: string, initials: string) => {
    await signContract({ token, session, name, signature, initials });
    await refetch();
    setSigning(false);
    // Once the pages have settled with the signature on them.
    setTimeout(() => document.querySelector("article .ct-parties")?.scrollIntoView({ block: "center" }), 150);
  };

  return (
    <div className={canSign ? "ct-viewer" : "ct-viewer ct-done"}>
      <div className="ct-bar">
        <span className="ct-file">{data.staff ? "Staff view: not logged" : `${data.title} ${data.reference}.pdf`}</span>
        <span className="ct-count">{page.at} / {page.of}</span>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>
      {data.staff && <p className="ct-staff-note">You're logged in to EstateKit, so you can't sign here and this visit isn't counted. Your client will see a Sign button. To try it as a client, open this link in a private window.</p>}
      <ContractSheet
        doc={data.document}
        reference={data.reference}
        issuedAt={data.issuedAt}
        documentHash={data.documentHash}
        signed={data.signed}
        pagesRef={setPages}
        clientField={canSign
          ? <button type="button" className="ct-field" onClick={() => setSigning(true)}>Sign here</button>
          : <div className="ct-field-empty">The client signs here</div>}
        issuerField={<div className="ct-mark" />}
      />
      <p className="ct-viewer-note">We record when this agreement is opened, how long it's read, and the date, time, device and internet address used to sign it, as proof of signature.</p>
      {canSign && <div className="ct-actionbar"><button type="button" onClick={() => setSigning(true)}>Sign</button></div>}
      {signing && (
        <SignDialog
          title="Sign this agreement"
          action="Sign agreement"
          name={data.signerName}
          askName
          askInitials={!!data.document.initials}
          note={data.document.initials
            ? 'Your initials confirm that "Your part", "Mandate Guarantee", "No other guarantees" and "Liability" were pointed out to you. By signing, you agree to this agreement, and your signature has the same effect as signing by hand.'
            : "By signing, you agree to this agreement. Your signature has the same effect as signing by hand."}
          onCancel={() => setSigning(false)}
          onSign={sign}
        />
      )}
    </div>
  );
}
