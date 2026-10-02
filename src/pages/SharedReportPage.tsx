import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSharedReport } from "../api/weeklyReportSends";
import { ReportArticle } from "./WeeklyReportPage";
import "./report.css";

// The agent's copy of a weekly report: /r/<token>, the link the CSM sends on
// WhatsApp. No sign-in. Shows the report exactly as it was sent, and opening
// it is what marks "Opened" on the CSM's Weekly reports table.

export default function SharedReportPage() {
  const { token = "" } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sharedReport", token],
    queryFn: () => getSharedReport(token),
    // One fetch per visit: each fetch counts as an open.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    if (data) document.title = `Weekly report · ${data.name} · ${data.period}`;
  }, [data]);

  if (!data) {
    return (
      <div className="wr-viewer">
        <div className="wr-page" style={{ padding: 40, textAlign: "center" }}>
          {isLoading ? "Loading your report…" : isError ? "Couldn't load this report. Check your signal and refresh." : "This report link isn't valid. Ask your EstateKit contact for a new one."}
        </div>
      </div>
    );
  }

  return (
    <div className="wr-viewer">
      <div className="wr-bar">
        <div className="wr-bar-title">Your weekly report</div>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>
      <ReportArticle name={data.name} avatarUrl={data.avatarUrl} period={data.period} d={data.data} />
    </div>
  );
}
