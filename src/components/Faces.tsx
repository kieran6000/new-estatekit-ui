import { Box } from "@mui/material";
import SentimentVeryDissatisfiedRoundedIcon from "@mui/icons-material/SentimentVeryDissatisfiedRounded";
import SentimentDissatisfiedRoundedIcon from "@mui/icons-material/SentimentDissatisfiedRounded";
import SentimentNeutralRoundedIcon from "@mui/icons-material/SentimentNeutralRounded";
import SentimentSatisfiedAltRoundedIcon from "@mui/icons-material/SentimentSatisfiedAltRounded";
import SentimentVerySatisfiedRoundedIcon from "@mui/icons-material/SentimentVerySatisfiedRounded";

// Check-in answers are faces, from a red frown (1) to a green grin (5): you
// can read how someone feels without reading a number. The client taps them on
// their form, and the team sees the same faces on the dashboard.

export const FACES = [
  { n: 1, Icon: SentimentVeryDissatisfiedRoundedIcon, color: "#dc2626", word: "Very poor" },
  { n: 2, Icon: SentimentDissatisfiedRoundedIcon, color: "#ea580c", word: "Not great" },
  { n: 3, Icon: SentimentNeutralRoundedIcon, color: "#ca8a04", word: "Okay" },
  { n: 4, Icon: SentimentSatisfiedAltRoundedIcon, color: "#65a30d", word: "Good" },
  { n: 5, Icon: SentimentVerySatisfiedRoundedIcon, color: "#16a34a", word: "Great" },
] as const;

/** The face for a score (an average is rounded to the nearest face). */
export const faceFor = (score: number) => FACES[Math.min(5, Math.max(1, Math.round(score))) - 1];

/** One face, coloured, for a score. */
export function Face({ n, size = 20 }: { n: number; size?: number }) {
  const f = faceFor(n);
  return (
    <Box component="span" role="img" aria-label={`${f.word} (${n} of 5)`} sx={{ display: "inline-flex", flex: "none", lineHeight: 0 }}>
      <f.Icon sx={{ fontSize: size, color: f.color }} />
    </Box>
  );
}
