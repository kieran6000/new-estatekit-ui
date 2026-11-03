import { useEffect, type ReactNode } from "react";
import { deviceName, type SignedRecord } from "../api/contracts";
import type { ContractDocument } from "../lib/contractTemplate";
import "../pages/contract.css";

// Loaded here, not with the app: only contracts use it.
const SERIF = "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,700&display=swap";

const SA_TIME: Intl.DateTimeFormatOptions = { timeZone: "Africa/Johannesburg" };
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { ...SA_TIME, day: "numeric", month: "long", year: "numeric" });
const dateTime = (iso: string) => `${dateOnly(iso)}, ${new Date(iso).toLocaleTimeString("en-ZA", { ...SA_TIME, hour: "2-digit", minute: "2-digit", second: "2-digit" })} SAST`;

/** The agreement as a document: the client's page, the team's preview and the
 *  signed copy all use this, so what's previewed is what's signed. `signing`
 *  is the place for the signature form while it's unsigned. */
export default function ContractSheet({ doc, reference, issuedAt, issuedBy, documentHash, signed, signing, clausesRef }: {
  doc: ContractDocument;
  reference: string;
  issuedAt: string;
  issuedBy: string | null;
  documentHash?: string;
  signed?: SignedRecord | null;
  signing?: ReactNode;
  clausesRef?: (el: HTMLElement | null) => void;
}) {
  useEffect(() => {
    if (document.querySelector(`link[href="${SERIF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = SERIF;
    document.head.appendChild(link);
  }, []);
  const clientName = doc.company ? `${doc.client}, ${doc.company}` : doc.client;
  return (
    <article className="ct-sheet">
      <header className="ct-top">
        <span className="ct-brand">{doc.provider}</span>
        <span className="ct-ref">Reference {reference}</span>
      </header>

      <h1 className="ct-title">{doc.title}</h1>
      <p className="ct-between">Between {doc.provider} and {clientName}. Issued {dateOnly(issuedAt)}.</p>

      <dl className="ct-terms">
        {doc.summary.map((s) => (
          <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>
        ))}
      </dl>

      <div ref={clausesRef}>
        {doc.sections.map((section, i) => (
          <section className="ct-section" key={section.heading}>
            <h2>{i + 1}. {section.heading}</h2>
            {section.clauses.map((clause, j) => (
              <div className="ct-clause" key={j}>
                <span>{i + 1}.{j + 1}</span>
                <p>{clause}</p>
              </div>
            ))}
          </section>
        ))}
      </div>

      <section className="ct-execution" id="sign">
        <h2>{signed ? "Signed" : "Signature"}</h2>
        {signed ? (
          <div className="ct-parties">
            <div className="ct-party">
              <img src={signed.signature} alt={`Signature of ${signed.name}`} />
              <div className="ct-party-line">{signed.name}</div>
              <div className="ct-party-note">For the Client<br />{dateTime(signed.at)}</div>
            </div>
            <div className="ct-party">
              <div className="ct-party-mark">{doc.provider}</div>
              <div className="ct-party-line">{issuedBy || doc.provider}</div>
              <div className="ct-party-note">For {doc.provider}<br />Issued {dateOnly(issuedAt)}</div>
            </div>
          </div>
        ) : signing}
      </section>

      {signed && (
        <section className="ct-record">
          <h3>Signing record</h3>
          <dl>
            <div><dt>Reference</dt><dd>{reference}</dd></div>
            <div><dt>Signed by</dt><dd>{signed.name}</dd></div>
            <div><dt>Date and time</dt><dd>{dateTime(signed.at)}</dd></div>
            <div><dt>Confirmed by</dt><dd>Code sent to WhatsApp number {signed.maskedPhone}</dd></div>
            <div><dt>Device</dt><dd>{deviceName(signed.userAgent)}</dd></div>
            <div><dt>Internet address</dt><dd>{signed.ip || "Not recorded"}</dd></div>
            {documentHash && <div><dt>Document fingerprint (SHA-256)</dt><dd className="ct-hash">{documentHash}</dd></div>}
          </dl>
        </section>
      )}
    </article>
  );
}
