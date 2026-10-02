import { Box, type SxProps, type Theme } from "@mui/material";
import blueLogo from "../assets/blue logo full.png";
import whiteLogo from "../assets/whitelogofull.png";
import { useThemeMode } from "../lib/themeMode";

/** The EstateKit wordmark: blue on light surfaces, white in dark mode. */
export default function EstateKitLogo({ sx }: { sx?: SxProps<Theme> }) {
  const { scheme } = useThemeMode();
  return <Box component="img" src={scheme === "dark" ? whiteLogo : blueLogo} alt="EstateKit" sx={sx} />;
}
