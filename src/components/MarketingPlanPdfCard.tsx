import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Button, CircularProgress, Link, Typography } from "@mui/material";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { tokens } from "../theme";
import { removePlanPdf, upsertProfile, uploadPlanPdf, type AgentProfile } from "../api/agentProfile";
import { useSnack } from "../hooks/useSnack";
import { trackActivity } from "../lib/activity";
import InfoTip from "./InfoTip";

const MAX_MB = 20;

/** "Your own marketing plan (PDF)": an optional, already-branded PDF for this
 *  agent. Seller leads still get the personal plan page (from the thank-you
 *  page and the email); when there's a PDF, that page also offers it as a
 *  download. Operators upload it; agents see which one is in use. */
export default function MarketingPlanPdfCard({ profile, canSetUp }: { profile: AgentProfile | null | undefined; canSetUp: boolean }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!profile) return null;
  if (!canSetUp && !profile.planPdfUrl) return null;
  const agentId = profile.agentId;
  const current = profile.planPdfUrl;

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: ["myProfile"] }), qc.invalidateQueries({ queryKey: ["clients"] })]);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      showSnack("That isn't a PDF. Choose a .pdf file.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      showSnack(`That PDF is over ${MAX_MB} MB. Make it smaller and try again.`);
      return;
    }
    setBusy(true);
    try {
      const url = await uploadPlanPdf(agentId, file);
      const name = file.name.replace(/\.pdf$/i, "").slice(0, 120);
      await upsertProfile({ planPdfUrl: url, planPdfName: name }, agentId);
      if (current) void removePlanPdf(current).catch(() => {});
      trackActivity("client_details_edited", { agentId, detail: `Marketing plan PDF ${current ? "replaced" : "added"}: ${name}` });
      await refresh();
      showSnack("PDF added. Sellers can open it from their plan.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't upload the PDF. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!current) return;
    setBusy(true);
    try {
      await upsertProfile({ planPdfUrl: null, planPdfName: null }, agentId);
      void removePlanPdf(current).catch(() => {});
      trackActivity("client_details_edited", { agentId, detail: "Marketing plan PDF removed" });
      await refresh();
      showSnack("PDF removed");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't remove it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Own marketing plan (PDF)
        </Typography>
        <InfoTip>
          Optional. Seller leads always get a short plan page made for them, from the thank-you page and the email. If you add a branded PDF here,
          that page also has a button to open it.
        </InfoTip>
      </Box>

      {current ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
          <PictureAsPdfOutlinedIcon sx={{ color: tokens.red }} />
          <Link href={current} target="_blank" rel="noopener" sx={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, wordBreak: "break-word" }}>
            {profile.planPdfName || "Marketing plan"}.pdf
          </Link>
          {canSetUp && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button size="small" disabled={busy} onClick={() => input.current?.click()}>Replace</Button>
              <Button size="small" color="error" disabled={busy} onClick={remove}>Remove</Button>
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: 13.5, color: "text.secondary", flex: 1, minWidth: 200 }}>
            None. Sellers get the standard plan page only.
          </Typography>
          <Button variant="outlined" disabled={busy} startIcon={busy ? <CircularProgress size={16} /> : <UploadFileIcon />} onClick={() => input.current?.click()}>
            Upload PDF
          </Button>
        </Box>
      )}
      {canSetUp && busy && current && <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Working…</Typography>}
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
    </Box>
  );
}
