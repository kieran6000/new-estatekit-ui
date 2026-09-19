import { useRef, useState } from "react";
import { Box, InputBase, Typography } from "@mui/material";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { tokens } from "../theme";

// A 1:1 WhatsApp chat mockup of an automation message, filled in for a real
// lead. The lead-action link is a real link to /l/:leadId so it's clickable
// here. Optionally editable: double-click the bubble, click away to save.

export interface PreviewLead {
  id: string;
  name: string;
  phone: string;
  stage: string;
  next_label: string;
}

const LINK_TOKEN = "{{action_link}}";

/** Deterministic 4-char mock slug so the same lead always previews the same short link. */
function shortSlugFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36).padStart(4, "0").slice(0, 4);
}

function fillTemplate(text: string, lead: PreviewLead, extra?: Record<string, string>): string {
  const fields: Record<string, string> = {
    name: lead.name,
    first_name: lead.name.split(" ")[0],
    phone: lead.phone,
    stage: lead.stage,
    next_label: lead.next_label,
    // Caller-supplied values win: the daily digest is addressed to the agent and
    // talks about a count, so a lead's name would be the wrong preview entirely.
    ...extra,
  };
  // {{action_link}} is left in place and rendered as a link below.
  return text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key === "action_link" ? m : fields[key] ?? m));
}

export default function WhatsAppPreview({
  lead,
  text,
  time,
  editable = false,
  onSave,
  sampleFields,
}: {
  lead: PreviewLead | undefined;
  text: string | null;
  /** Timestamp shown on the bubble — defaults to now. */
  time?: Date;
  editable?: boolean;
  /** Called with the new template text when an edit is committed. */
  onSave?: (text: string) => void;
  /** Overrides for placeholders this template uses that aren't lead fields
   *  (e.g. the daily digest's {{count}}), so the preview shows real wording
   *  instead of a literal "{{count}}". */
  sampleFields?: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelled = useRef(false);

  if (!lead || !text) return null;

  const parts = fillTemplate(text, lead, sampleFields).split(LINK_TOKEN);
  const link = `ek.co/L/${shortSlugFor(lead.id)}`;

  function startEditing() {
    if (!editable) return;
    cancelled.current = false;
    setDraft(text ?? "");
    setEditing(true);
  }

  function finish() {
    setEditing(false);
    if (cancelled.current) return;
    if (draft.trim() && draft !== text) onSave?.(draft);
  }

  return (
    <Box sx={{ borderRadius: "8px", overflow: "hidden", border: `1px solid ${tokens.divider}` }}>
      <Box sx={{ bgcolor: "#075e54", color: "#fff", px: 1.5, py: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>WhatsApp preview</Typography>
        {editable && (
          <Typography sx={{ fontSize: 11.5, opacity: 0.75 }}>{editing ? "Click away to save · Esc to cancel" : "Double-click to edit"}</Typography>
        )}
      </Box>
      <Box
        sx={{
          bgcolor: "#e5ddd5",
          backgroundImage:
            "radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px), radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0, 9px 9px",
          p: "14px 12px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Box
          onDoubleClick={startEditing}
          sx={{
            maxWidth: "80%",
            width: editing ? "80%" : "auto",
            bgcolor: "#dcf8c6",
            borderRadius: "8px",
            borderTopRightRadius: 0,
            p: "7px 9px 6px",
            boxShadow: editing ? "0 0 0 2px #25d366" : "0 1px 1px rgba(0,0,0,.12)",
            cursor: editable && !editing ? "text" : "default",
          }}
        >
          {editing ? (
            <InputBase
              multiline
              fullWidth
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finish}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  cancelled.current = true;
                  (e.target as HTMLElement).blur();
                }
              }}
              sx={{ fontSize: 13.5, color: "#111", lineHeight: 1.35, p: 0 }}
            />
          ) : (
            <Typography sx={{ fontSize: 13.5, color: "#111", whiteSpace: "pre-wrap", lineHeight: 1.35, wordBreak: "break-word" }}>
              {parts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < parts.length - 1 && (
                    <Box component="a" href={`/l/${lead.id}`} target="_blank" rel="noopener" sx={{ color: "#0b57d0" }}>
                      {link}
                    </Box>
                  )}
                </span>
              ))}
            </Typography>
          )}
          <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 0.4, mt: 0.5 }}>
            <Typography sx={{ fontSize: 10.5, color: "rgba(0,0,0,.45)" }}>
              {(time ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Typography>
            <DoneAllIcon sx={{ fontSize: 14, color: "#53bdeb" }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
