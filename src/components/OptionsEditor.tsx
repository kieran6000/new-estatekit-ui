import { useRef } from "react";
import { Box, Button, IconButton, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";

/** Answer options for a multiple-choice question, one per row. Replaces typing
 *  them into one box with separators, which nobody outside the team would
 *  know to do. Enter on the last row adds a new one. */
export default function OptionsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const rows = value.length ? value : [""];

  function set(i: number, text: string) {
    const next = [...rows];
    next[i] = text;
    onChange(next);
  }
  function add(focus = true) {
    onChange([...rows, ""]);
    if (focus) setTimeout(() => inputs.current[rows.length]?.focus(), 0);
  }
  function remove(i: number) {
    const next = rows.filter((_, j) => j !== i);
    onChange(next.length ? next : [""]);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Answers</Typography>
      {rows.map((opt, i) => (
        <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <TextField
            size="small"
            fullWidth
            placeholder={`Answer ${i + 1}`}
            value={opt}
            inputRef={(el) => { inputs.current[i] = el; }}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (i === rows.length - 1 && opt.trim()) add();
                else inputs.current[i + 1]?.focus();
              }
            }}
          />
          <IconButton size="small" aria-label={`Remove answer ${i + 1}`} onClick={() => remove(i)} disabled={rows.length === 1 && !opt}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<AddIcon fontSize="small" />} onClick={() => add()} sx={{ alignSelf: "flex-start" }}>
        Add answer
      </Button>
    </Box>
  );
}

