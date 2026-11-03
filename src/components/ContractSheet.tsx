import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { deviceName, type SignedRecord } from "../api/contracts";
import type { ContractDocument } from "../lib/contractTemplate";
import "../pages/contract.css";

const SA_TIME: Intl.DateTimeFormatOptions = { timeZone: "Africa/Johannesburg" };
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { ...SA_TIME, day: "numeric", month: "long", year: "numeric" });
const dateTime = (iso: string) => `${dateOnly(iso)}, ${new Date(iso).toLocaleTimeString("en-ZA", { ...SA_TIME, hour: "2-digit", minute: "2-digit", second: "2-digit" })} SAST`;

/** The agreement as PDF pages: the client's page, the team's preview and the
 *  signed copy all use this, so what's previewed is what's signed. The fields
 *  are what shows in a signature's place until there is one. Clauses fill each
 *  page until it's full, at whatever size the screen makes the page. */
export default function ContractSheet({ doc, reference, issuedAt, documentHash, signed, clientField, issuerField, pagesRef }: {
  doc: ContractDocument;
  reference: string;
  issuedAt: string;
  documentHash?: string;
  signed?: SignedRecord | null;
  clientField?: ReactNode;
  issuerField?: ReactNode;
  pagesRef?: (el: HTMLElement | null) => void;
}) {
  const blocks = useMemo<ReactNode[]>(() => {
    const list: ReactNode[] = [
      <>
        <header className="ct-letterhead">
          <div>
            <p className="ct-brand">{doc.provider}</p>
            <p className="ct-brand-sub">{doc.title}</p>
          </div>
          <div className="ct-ref">
            Ref: <b>{reference}</b><br />
            Date: <b>{dateOnly(issuedAt)}</b><br />
            Status: <b>{signed ? "Signed" : "Awaiting signature"}</b>
          </div>
        </header>
        <h1>{doc.title}</h1>
        <p className="ct-sub">Between {doc.provider} and {doc.client}.</p>
        <table className="ct-table">
          <tbody>
            <tr><th scope="row">Prepared for</th><td>{doc.company ? `${doc.client}, ${doc.company}` : doc.client}</td></tr>
            {doc.summary.map((s) => <tr key={s.label}><th scope="row">{s.label}</th><td>{s.value}</td></tr>)}
          </tbody>
        </table>
      </>,
    ];
    doc.sections.forEach((section, i) => {
      section.clauses.forEach((clause, j) => {
        const line = <div className="ct-clause"><span>{i + 1}.{j + 1}</span><p>{clause}</p></div>;
        // A heading never ends a page on its own: it stays with its first clause.
        list.push(j === 0 ? <><h2>{i + 1}. {section.heading}</h2>{line}</> : line);
      });
    });
    list.push(
      <>
        <h2>Signatures</h2>
        <div className="ct-parties">
          <div>
            <p className="ct-party-label">For the Client</p>
            {signed ? <div className="ct-mark"><img src={signed.signature} alt={`Signature of ${signed.name}`} /></div> : clientField}
            <div className="ct-party-line">{signed?.name ?? doc.client}</div>
            <div className="ct-party-note">{signed ? dateTime(signed.at) : "Date: when signed"}</div>
          </div>
          <div>
            <p className="ct-party-label">For {doc.provider}</p>
            {doc.issuer?.signature ? <div className="ct-mark"><img src={doc.issuer.signature} alt={`Signature of ${doc.issuer.name}`} /></div> : issuerField ?? <div className="ct-mark" />}
            <div className="ct-party-line">{doc.issuer?.name || doc.provider}</div>
            <div className="ct-party-note">{dateOnly(issuedAt)}</div>
          </div>
        </div>
      </>,
    );
    if (signed) {
      list.push(
        <>
          <h2>Signing record</h2>
          <table className="ct-table">
            <tbody>
              <tr><th scope="row">Reference</th><td>{reference}</td></tr>
              <tr><th scope="row">Signed by</th><td>{signed.name}</td></tr>
              <tr><th scope="row">Date and time</th><td>{dateTime(signed.at)}</td></tr>
              <tr><th scope="row">Link issued to</th><td>WhatsApp number {signed.maskedPhone}</td></tr>
              <tr><th scope="row">Device</th><td>{deviceName(signed.userAgent)}</td></tr>
              <tr><th scope="row">Internet address</th><td>{signed.ip || "Not recorded"}</td></tr>
              {documentHash && <tr><th scope="row">Document fingerprint (SHA-256)</th><td className="ct-hash">{documentHash}</td></tr>}
            </tbody>
          </table>
        </>,
      );
    }
    return list;
  }, [doc, reference, issuedAt, documentHash, signed, clientField, issuerField]);

  const measure = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);

  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const paginate = () => {
      // A real page's room: its height, less the padding the copy doesn't have.
      const style = getComputedStyle(el);
      const width = el.getBoundingClientRect().width;
      const padding = window.matchMedia("(max-width: 600px)").matches ? 56 : 120;
      const room = width * 1.414 - padding;
      if (!(room > 0) || style.display === "none") return;
      const next: number[][] = [[]];
      let used = 0;
      [...el.children].forEach((child, i) => {
        const h = child.getBoundingClientRect().height;
        if (used + h > room && next[next.length - 1].length) {
          next.push([]);
          used = 0;
        }
        next[next.length - 1].push(i);
        used += h;
      });
      setPages((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    paginate();
    const watcher = new ResizeObserver(paginate);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [blocks]);

  const shown = pages && pages.flat().length === blocks.length ? pages : [blocks.map((_, i) => i)];
  return (
    <div className="ct-pages" ref={pagesRef}>
      <div className="ct-page ct-measure" ref={measure} aria-hidden>
        {blocks.map((b, i) => <div className="ct-block" key={i}>{b}</div>)}
      </div>
      {shown.map((page, n) => (
        <article className="ct-page" key={n}>
          {page.map((i) => <div className="ct-block" key={i}>{blocks[i]}</div>)}
          <footer className="ct-foot">
            <span>{doc.provider} · {doc.title} · Ref {reference}</span>
            <span>Page {n + 1} of {shown.length}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}
