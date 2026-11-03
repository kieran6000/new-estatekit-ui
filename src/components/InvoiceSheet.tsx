import { longDate, money, type InvoiceDocument } from "../lib/invoiceTemplate";
import logo from "../assets/whitelogofull.png";
import "../pages/contract.css";
import "../pages/invoice.css";

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="inv-line">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

/** The invoice as a page: the client's link, the team's check and the saved PDF
 *  all use this, so what's checked is what's sent. */
export default function InvoiceSheet({ doc, reference, paid }: { doc: InvoiceDocument; reference: string; paid?: boolean }) {
  return (
    <article className="inv-sheet">
      <header className="inv-banner">
        <div>
          <img src={logo} alt="EstateKit" />
          <p className="inv-tag">Real estate lead generation</p>
        </div>
        <div className="inv-banner-right">
          <p className="inv-title">Invoice</p>
          <p>{doc.location}</p>
          <p>{doc.contactEmail}</p>
        </div>
      </header>

      <div className="inv-body">
        <section className="inv-columns">
          <div>
            <h2>Invoice details</h2>
            <Line k="Invoice #" v={reference} />
            <Line k="Issue date" v={longDate(doc.issueDate)} />
            <Line k="Due date" v={longDate(doc.dueDate)} />
          </div>
          <div>
            <h2>Bill to</h2>
            <Line k="Name" v={doc.name} />
            {doc.agency && <Line k="Agency" v={doc.agency} />}
            {doc.email && <Line k="Email" v={doc.email} />}
            <Line k="Phone" v={doc.phone} />
          </div>
        </section>

        <table className="inv-items">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Description</th>
              <th scope="col" className="inv-num">Qty</th>
              <th scope="col" className="inv-num">Rate</th>
              <th scope="col" className="inv-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{doc.item}</th>
              <td>{doc.description}{doc.period && <span>{doc.period}</span>}</td>
              <td className="inv-num">1</td>
              <td className="inv-num">{money(doc.amount)}</td>
              <td className="inv-num"><b>{money(doc.amount)}</b></td>
            </tr>
          </tbody>
        </table>

        <section className="inv-columns inv-summary">
          <div className="inv-terms">
            <h2>Terms</h2>
            {doc.terms.map((t) => <p key={t}>{t}</p>)}
          </div>
          <div>
            <div className="inv-sum"><b>Subtotal</b><span>{money(doc.amount)}</span></div>
            <div className="inv-sum"><b>VAT</b><span>Not applicable</span></div>
            <div className="inv-total"><span>{paid ? "Paid" : "Total due"}</span><span>{money(doc.amount)}</span></div>
          </div>
        </section>

        <section className="inv-bank">
          <h2>Banking details (EFT)</h2>
          <div className="inv-bank-rows">
            <div className="inv-bank-row"><span>Bank</span><b>{doc.bank.bank}</b></div>
            <div className="inv-bank-row"><span>Account holder</span><b>{doc.bank.holder}</b></div>
            <div className="inv-bank-row"><span>Account number</span><b className="inv-account">{doc.bank.account}</b></div>
            <div className="inv-bank-row"><span>Branch code</span><b>{doc.bank.branch}</b></div>
            <div className="inv-bank-row"><span>Country</span><b>{doc.bank.country}</b></div>
          </div>
          <div className="inv-reference">
            <div className="inv-bank-row"><span className="inv-reference-label">Reference</span><b>{reference}</b></div>
            <p>Send proof of payment to {doc.contactEmail}</p>
          </div>
        </section>
      </div>

      <footer className="inv-foot">
        <span>EstateKit | {doc.location} | {doc.contactEmail}</span>
        <b>Thank you for your business</b>
      </footer>
    </article>
  );
}
