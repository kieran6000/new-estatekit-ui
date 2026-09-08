import { useColorScheme } from "@mui/material/styles";
import { Box, Switch, Typography } from "@mui/material";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import { tokens } from "../theme";

/** Operator-only light/dark switch. Mode is persisted per-browser by MUI. */
export default function DarkModeToggle() {
  const { mode, setMode } = useColorScheme();
  // `mode` can be "system"; treat anything that resolves dark as on.
  const isDark = mode === "dark";

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <DarkModeOutlinedIcon sx={{ color: "text.secondary" }} />
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>Dark mode</Typography>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          Easier on the eyes at night. Only you see this.
        </Typography>
      </Box>
      <Switch
        checked={isDark}
        onChange={(e) => setMode(e.target.checked ? "dark" : "light")}
        sx={{ "& .Mui-checked": { color: tokens.primary } }}
      />
    </Box>
  );
}
