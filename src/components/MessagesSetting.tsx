import { useState } from "react";
import { Box, ButtonBase, Card, CardContent, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useQueryClient } from "@tanstack/react-query";
import { upsertProfile, type AgentProfile, type MessageLevel } from "../api/agentProfile";
import { useSnack } from "../hooks/useSnack";
import { trackActivity } from "../lib/activity";
import { tokens } from "../theme";

// How many WhatsApps EstateKit sends the agent, on the Account page. The
// engine reads it before every "WhatsApp the agent" step (run-automations
// allowedByLevel); messages to their leads aren't affected.

const OPTIONS: { value: MessageLevel; label: string; hint: string }[] = [
  { value: "new_leads", label: "Just new leads", hint: "A WhatsApp the moment a new lead comes in. Nothing else." },
  { value: "morning", label: "New leads + a morning list", hint: "New leads, plus one message on weekday mornings with how many leads to follow up that day." },
  { value: "everything", label: "Everything", hint: "All of the above, plus reminders before calls and appointments." },
];

export default function MessagesSetting({ profile }: { profile: AgentProfile }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [level, setLevel] = useState<MessageLevel>(profile.messageLevel);

  async function choose(next: MessageLevel) {
    if (next === level) return;
    const prev = level;
    setLevel(next);
    try {
      await upsertProfile({ messageLevel: next }, profile.agentId);
      trackActivity("automation_toggled", { agentId: profile.agentId, detail: `WhatsApp messages: ${OPTIONS.find((o) => o.value === next)?.label}` });
      await qc.invalidateQueries({ queryKey: ["myProfile"] });
      showSnack("Saved");
    } catch (e) {
      console.error(e);
      setLevel(prev);
      showSnack("Couldn't save. Try again.");
    }
  }

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box>
          <Typography variant="subtitle1" component="h2" id="messages-label" sx={{ fontWeight: 600 }}>
            WhatsApp messages from EstateKit
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Choose how much we message you. You can change this any time.
          </Typography>
        </Box>
        <Box role="radiogroup" aria-labelledby="messages-label" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {OPTIONS.map((o) => {
            const on = level === o.value;
            return (
              <ButtonBase
                key={o.value}
                role="radio"
                aria-checked={on}
                onClick={() => void choose(o.value)}
                focusRipple
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  gap: 1.5,
                  textAlign: "left",
                  minHeight: 64,
                  px: 2,
                  py: 1.5,
                  borderRadius: "8px",
                  border: `2px solid ${on ? tokens.primary : tokens.divider}`,
                  bgcolor: on ? tokens.primaryBg : "background.paper",
                  transition: "border-color .15s, background-color .15s",
                  "&:hover": { borderColor: on ? tokens.primary : tokens.outline },
                  "&.Mui-focusVisible": { outline: `2px solid ${tokens.primary}`, outlineOffset: 2 },
                }}
              >
                {on
                  ? <CheckCircleIcon sx={{ fontSize: 24, color: tokens.primary, mt: "1px" }} />
                  : <RadioButtonUncheckedIcon sx={{ fontSize: 24, color: "text.disabled", mt: "1px" }} />}
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{o.label}</Typography>
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{o.hint}</Typography>
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
