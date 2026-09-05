import { useState } from "react";
import { Box, Typography } from "@mui/material";

/** Clean, modern labelled input — deliberately not the stock Material
 *  filled/outlined look. Label above, soft rounded field, brand focus ring. */
export default function AuthField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
  inputMode,
  autoComplete,
  hint,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email";
  autoComplete?: string;
  hint?: string;
  onEnter?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Box sx={{ mb: 2 }}>
      <Typography component="label" sx={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", mb: 0.75 }}>
        {label}
      </Typography>
      <Box
        component="input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        sx={{
          width: "100%",
          boxSizing: "border-box",
          fontSize: 15,
          fontFamily: "inherit",
          color: "#111827",
          p: "12px 14px",
          borderRadius: "10px",
          border: `1.5px solid ${focused ? "#2563eb" : "#d1d5db"}`,
          outline: "none",
          bgcolor: "#fff",
          boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.15)" : "none",
          transition: "border-color .15s, box-shadow .15s",
          "&::placeholder": { color: "#9ca3af" },
        }}
      />
      {hint && <Typography sx={{ fontSize: 12, color: "#6b7280", mt: 0.5 }}>{hint}</Typography>}
    </Box>
  );
}
