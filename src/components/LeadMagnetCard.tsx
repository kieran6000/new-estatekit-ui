import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Button, CircularProgress, Link, MenuItem, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { tokens } from "../theme";
import { saveLeadMagnet } from "../api/leadPages";
import { uploadPlanPdf } from "../api/agentProfile";
import { useSnack } from "../hooks/useSnack";
import { trackActivity } from "../lib/activity";
import { readableOn } from "../lib/contrast";
import { MAGNET_PRESETS, presetByKey, presetKeyOf, resolveMagnet, type MagnetKind } from "../lib/leadMagnet";
import type { LeadPage } from "../types";
import InfoTip from "./InfoTip";

const MAX_MB = 20;

/** "Lead magnet": what leads get straight after this form, on the thank-you
 *  page and wherever a workflow email has {{lead_magnet}} (the standard
 *  "New lead — confirmation email" does). Pick a preset, change the words if
 *  you like, upload the PDF. Staff set it; agents see what's set. */
export default function LeadMagnetCard({ page, pipelineKind, canSetUp }: { page: LeadPage; pipelineKind: string | null | undefined; canSetUp: boolean }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const input = useRef<HTMLInputElement>(null);
  const seller = pipelineKind === "seller";

  const saved = { kind: page.magnetKind ?? null, title: page.magnetTitle ?? "", text: page.magnetText ?? "", button: page.magnetButton ?? "", pdfUrl: page.magnetPdfUrl ?? null };
  const [draft, setDraft] = useState(saved);
  const [presetKey, setPresetKey] = useState(() => presetKeyOf(page, pipelineKind));
  const [busy, setBusy] = useState(false);
  // Another form opened (or a save landed): start from what's stored.
  useEffect(() => {
    setDraft({ kind: page.magnetKind ?? null, title: page.magnetTitle ?? "", text: page.magnetText ?? "", button: page.magnetButton ?? "", pdfUrl: page.magnetPdfUrl ?? null });
    setPresetKey(presetKeyOf(page, pipelineKind));
  }, [page.id, page.magnetKind, page.magnetTitle, page.magnetText, page.magnetButton, page.magnetPdfUrl, pipelineKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields = { magnetKind: draft.kind, magnetTitle: draft.title, magnetText: draft.text, magnetButton: draft.button, magnetPdfUrl: draft.pdfUrl };
  const m = resolveMagnet(fields, pipelineKind);
  const kind: MagnetKind = draft.kind ?? (seller ? "plan" : "none");
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const needsPdf = kind === "pdf" && !draft.pdfUrl;
  const previewUrl = m.kind === "pdf" ? m.pdfUrl : m.kind === "plan" ? `/plan/sample/${page.agentId}` : null;

  function pick(key: string) {
    const p = presetByKey(key);
    setPresetKey(key);
    setDraft((d) => ({ ...d, kind: p.kind, title: p.title, text: p.text, button: p.button }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { showSnack("That isn't a PDF. Choose a .pdf file."); return; }
    if (file.size > MAX_MB * 1024 * 1024) { showSnack(`That PDF is over ${MAX_MB} MB. Make it smaller and try again.`); return; }
    setBusy(true);
    try {
      const url = await uploadPlanPdf(page.agentId, file);
      setDraft((d) => ({ ...d, pdfUrl: url }));
      showSnack("PDF uploaded. Save to use it.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't upload the PDF. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    setBusy(true);
    try {
      await saveLeadMagnet(page.id, fields);
      trackActivity("client_details_edited", { agentId: page.agentId, detail: `Lead magnet on ${page.name}: ${m.kind === "none" ? "nothing" : m.title}` });
      await Promise.all([qc.invalidateQueries({ queryKey: ["leadPages"] }), qc.invalidateQueries({ queryKey: ["publicPageSlug"] })]);
      showSnack(m.kind === "none" ? "Saved. Leads from this form get no lead magnet." : "Lead magnet saved. New leads get it from now.");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const label = { fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" } as const;

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
        <Typography sx={label}>Lead magnet</Typography>
        <InfoTip>
          What leads get straight after this form: a card on the thank-you page, and a box in any workflow email that has the Lead magnet field (the
          "New lead — confirmation email" workflow does). Both use the same link. You can see who opened it in the lead's history, and "Lead opens
          their lead magnet" can start a workflow.
        </InfoTip>
        <Box sx={{ flex: 1 }} />
        {previewUrl && (
          <Button size="small" href={previewUrl} target="_blank" rel="noopener" endIcon={<OpenInNewIcon />}>Preview</Button>
        )}
      </Box>

      {!canSetUp ? (
        <Typography sx={{ fontSize: 14 }}>
          {m.kind === "none" ? "Leads from this form don't get a lead magnet." : <>Leads get <b>{m.title}</b>{m.kind === "pdf" ? " (a PDF)" : ""}. Ask EstateKit to change it.</>}
        </Typography>
      ) : (
        <>
          <TextField select size="small" label="Leads get" value={presetKey} onChange={(e) => pick(e.target.value)}>
            {MAGNET_PRESETS.filter((p) => !p.sellersOnly || seller).map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
          </TextField>

          {kind !== "none" && (
            <>
              <TextField size="small" label="Headline" value={draft.title} placeholder={m.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} slotProps={{ htmlInput: { maxLength: 80 } }} />
              <TextField size="small" label="One line under it (optional)" value={draft.text} placeholder={m.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} slotProps={{ htmlInput: { maxLength: 140 } }} />
              <TextField size="small" label="Button" value={draft.button} placeholder={m.button} onChange={(e) => setDraft((d) => ({ ...d, button: e.target.value }))} slotProps={{ htmlInput: { maxLength: 40 } }} />
            </>
          )}

          {kind === "pdf" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 13.5, flex: 1, minWidth: 180, color: needsPdf ? tokens.red : "text.primary" }}>
                {needsPdf ? "Upload the PDF to switch it on." : <>PDF uploaded · <Link href={draft.pdfUrl!} target="_blank" rel="noopener">open it</Link></>}
              </Typography>
              <Button variant="outlined" size="small" disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : <UploadFileIcon />} onClick={() => input.current?.click()}>
                {draft.pdfUrl ? "Replace PDF" : "Upload PDF"}
              </Button>
              <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            </Box>
          )}

          {m.kind !== "none" && (
            // How it looks on the thank-you page, in the form's colour.
            <Box data-theme="light" sx={{ border: "1px solid #e0e0e0", borderLeft: `4px solid ${page.accentColor}`, borderRadius: "8px", bgcolor: "#fff", color: "#222", p: "12px 14px" }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{m.title}</Typography>
              {m.text && <Typography sx={{ fontSize: 13, color: "#555", mt: 0.25 }}>{m.text}</Typography>}
              <Box sx={{ mt: 1, display: "inline-block", bgcolor: page.accentColor, color: readableOn(page.accentColor), borderRadius: "8px", px: 1.5, py: 0.75, fontSize: 13.5, fontWeight: 700 }}>
                {m.button} →
              </Box>
            </Box>
          )}

          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="contained" disabled={busy || !changed} onClick={() => void save()}>Save</Button>
          </Box>
        </>
      )}
    </Box>
  );
}
