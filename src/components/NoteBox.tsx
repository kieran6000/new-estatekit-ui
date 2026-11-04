import { useMemo, useState } from "react";
import { Box, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { noteHistory } from "../api/leadActions";
import { noteTime, stampNote } from "../lib/noteStamps";
import { tokens } from "../theme";

/** A lead's note. Not being typed in, it shows a small date under each part.
 *  Tapped anywhere, it's a plain text box with the cursor at the end. The dates
 *  aren't in the text, so they can't be typed over or deleted. */
export default function NoteBox({ leadId, token, leadCreatedAt, value, onChange, onBlur, placeholder, minRows = 4, maxHeight, helperText, size, sx }: {
  leadId: string;
  /** For the WhatsApp link, when there's no login. */
  token?: string | null;
  leadCreatedAt?: string | null;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder?: string;
  minRows?: number;
  maxHeight?: number;
  helperText?: string;
  size?: "small" | "medium";
  sx?: object;
}) {
  const [editing, setEditing] = useState(false);
  const { data: versions } = useQuery({
    queryKey: ["noteHistory", leadId],
    queryFn: () => noteHistory(leadId, token),
    staleTime: 60_000,
    retry: false,
  });
  const blocks = useMemo(() => (versions ? stampNote(value, versions, leadCreatedAt) : []), [value, versions, leadCreatedAt]);
  const fontSize = size === "small" ? 14 : 16;

  if (editing || !value.trim() || !blocks.some((b) => b.at)) {
    return (
      <TextField
        multiline
        fullWidth
        size={size}
        minRows={minRows}
        maxRows={maxHeight ? 4 : undefined}
        autoFocus={editing}
        placeholder={placeholder}
        value={value}
        helperText={helperText}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => { const end = e.target.value.length; e.target.setSelectionRange(end, end); setEditing(true); }}
        onBlur={() => { setEditing(false); onBlur(); }}
        sx={sx}
      />
    );
  }
  return (
    <Box sx={sx}>
      <Box
        role="button"
        tabIndex={0}
        aria-label="Edit note"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
        sx={{ cursor: "text", border: `1px solid ${tokens.outline}`, borderRadius: "4px", px: 1.75, py: size === "small" ? 1 : 2, maxHeight, overflowY: maxHeight ? "auto" : undefined, "&:hover": { borderColor: tokens.ink }, "&:focus-visible": { outline: `2px solid ${tokens.primary}`, outlineOffset: -1 } }}
      >
        {blocks.map((b, i) => (
          <Box key={i} sx={{ mt: i ? 1.25 : 0 }}>
            <Typography sx={{ fontSize, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{b.text}</Typography>
            {b.at && <Typography sx={{ fontSize: 11.5, color: tokens.ink3, mt: 0.125 }}>{noteTime(b.at)}</Typography>}
          </Box>
        ))}
      </Box>
      {helperText && <Typography sx={{ fontSize: 11, color: "text.secondary", m: "2px 4px" }}>{helperText}</Typography>}
    </Box>
  );
}
