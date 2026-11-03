import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { viewInvoice, type SharedInvoice } from "../api/invoices";
import InvoiceSheet from "../components/InvoiceSheet";
import "./contract.css";

// The client's invoice: /i/<token>, the link the team sends on WhatsApp. No
// sign-in. It opens like a PDF and saves as one.

export default function InvoicePage() {
  const { token = "" } = useParams();
  const { data, isLoading, isError } = useQuery<SharedInvoice | null>({
    queryKey: ["invoice", token],
    queryFn: () => viewInvoice(token),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    if (data) document.title = `EstateKit invoice ${data.reference}`;
  }, [data]);

  if (!data || data.status === "cancelled") {
    const cancelled = data?.status === "cancelled";
    const heading = cancelled ? "This invoice has been cancelled" : isLoading ? "Opening your invoice…" : isError ? "We couldn't open this invoice" : "This link isn't valid";
    const detail = cancelled
      ? `Reference ${data.reference}. You don't need to pay it. Ask your EstateKit contact if you were expecting it.`
      : isLoading ? "" : isError ? "Check your signal and refresh the page." : "Ask your EstateKit contact for a new one.";
    return (
      <div className="ct-viewer ct-done">
        <div className="ct-message" role="status"><h1>{heading}</h1>{detail && <p>{detail}</p>}</div>
      </div>
    );
  }

  return (
    <div className="ct-viewer ct-done">
      <div className="ct-bar">
        <span className="ct-file">{data.staff ? "Staff view: not logged" : `EstateKit invoice ${data.reference}.pdf`}</span>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>
      {data.staff && <p className="ct-staff-note">You're logged in to EstateKit, so this visit isn't counted as your client opening it.</p>}
      <InvoiceSheet doc={data.document} reference={data.reference} paid={data.status === "paid"} />
      <p className="ct-viewer-note">We record when this invoice is opened.</p>
    </div>
  );
}
