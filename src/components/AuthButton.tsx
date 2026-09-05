import { Box, CircularProgress } from "@mui/material";

/** Full-width primary action button — flat, rounded, no Material uppercase/ripple noise. */
export default function AuthButton({
  children,
  onClick,
  disabled,
  busy,
  type = "button",
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "ghost";
}) {
  const primary = variant === "primary";
  return (
    <Box
      component="button"
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        border: primary ? "none" : "1.5px solid #d1d5db",
        borderRadius: "10px",
        p: "13px 16px",
        fontSize: 15,
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: disabled || busy ? "default" : "pointer",
        color: primary ? "#fff" : "#374151",
        bgcolor: primary ? "#2563eb" : "#fff",
        opacity: disabled && !busy ? 0.55 : 1,
        transition: "background-color .15s, opacity .15s",
        "&:hover": { bgcolor: disabled || busy ? undefined : primary ? "#1d4ed8" : "#f9fafb" },
      }}
    >
      {busy && <CircularProgress size={16} sx={{ color: primary ? "#fff" : "#374151" }} />}
      {children}
    </Box>
  );
}
