import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, Link, Switch, TextField, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { tokens } from "../theme";
import { upsertProfile, type AgentProfile } from "../api/agentProfile";
import { useSnack } from "../hooks/useSnack";
import { fillLeadEmail, LEAD_EMAIL_PLACEHOLDERS, STANDARD_LEAD_EMAIL_BODY } from "../lib/leadEmail";
import InfoTip from "./InfoTip";
import { getEmailStats } from "../api/leadEvents";

const SAMPLE = { name: "Thandi", address: "14 Loop Street, Centurion" };

/** "After they submit": the confirmation email each new lead gets in the
 *  agent's name. Operators switch it on and can give this agent their own
 *  wording; agents see exactly what is sent and can switch it off. The
 *  setting is per agent, so it covers all their forms (Facebook forms too). */
export default function ConfirmationEmailCard({
  profile,
  canSetUp,
}: {
  profile: AgentProfile | null | undefined;
  canSetUp: boolean;
}) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: stats } = useQuery({
    queryKey: ["emailStats", profile?.agentId],
    queryFn: () => getEmailStats(profile!.agentId),
    enabled: canSetUp && !!profile?.agentId,
    staleTime: 60_000,
  });

  useEffect(() => {
    setDraft(profile?.leadEmailBody ?? STANDARD_LEAD_EMAIL_BODY);
  }, [profile?.agentId, profile?.leadEmailBody]);

  if (!profile) return null;
  const on = profile.leadConfirmationEmail;
  const custom = !!profile.leadEmailBody;
  const fullName = (profile.displayName || "").trim() || "Your agent";
  const first = fullName.split(/\s+/)[0];
  const text = canSetUp ? draft : profile.leadEmailBody ?? STANDARD_LEAD_EMAIL_BODY;
  const paragraphs = fillLeadEmail(text, { name: SAMPLE.name, address: SAMPLE.address, agent: first });
  const changed = (draft.trim() || STANDARD_LEAD_EMAIL_BODY) !== (profile.leadEmailBody ?? STANDARD_LEAD_EMAIL_BODY);

  async function save(patch: Partial<AgentProfile>, done: string) {
    setSaving(true);
    try {
      await upsertProfile(patch, profile!.agentId);
      await Promise.all([qc.invalidateQueries({ queryKey: ["myProfile"] }), qc.invalidateQueries({ queryKey: ["clients"] })]);
      showSnack(done);
    } catch (e) {
      console.error(e);
      showSnack("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function saveWording() {
    const v = draft.trim();
    // Saving the standard text back means "use the standard".
    save({ leadEmailBody: !v || v === STANDARD_LEAD_EMAIL_BODY ? null : v }, "Email wording saved. It applies to the next lead.");
  }

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 30 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Confirmation email
          </Typography>
          <InfoTip>
            Each new lead who gives an email gets this from you, straight after sending the form. Replies go to your email, and the link opens WhatsApp
            to you. It applies to all your forms, including Facebook ones.
          </InfoTip>
        </Box>
        {!canSetUp && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
            <LockIcon sx={{ fontSize: 14 }} />
            <Typography sx={{ fontSize: 12 }}>Wording by EstateKit</Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Send it to new leads</Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            {on ? "On" : canSetUp ? "Off" : "Off. Ask EstateKit to switch it on."}
          </Typography>
        </Box>
        {/* Agents can always switch it off (it's in their name); switching on is ours. */}
        <Switch
          checked={on}
          disabled={saving || (!canSetUp && !on)}
          onChange={(e) => save({ leadConfirmationEmail: e.target.checked }, e.target.checked ? "Confirmation email on" : "Confirmation email off")}
        />
      </Box>

      {canSetUp && stats && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Last 30 days</Typography>
            <InfoTip>
              Number of leads. Delivered, bounced and spam come from the email service. Opened is only a rough guide: some email apps (like Apple Mail)
              report every email as opened. WhatsApp taps are counted exactly.
            </InfoTip>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 1, mt: 0.75 }}>
            {[
              ["Sent", stats.sent],
              ["Delivered", stats.delivered],
              ["Opened", stats.opened],
              ["Opened plan", stats.planOpened],
              ["Tapped WhatsApp", stats.clicked],
              ["Bounced", stats.bounced + stats.failed],
              ["Marked spam", stats.spam],
            ].map(([label, n]) => (
              <Box key={label as string} sx={{ border: `1px solid ${tokens.divider2}`, borderRadius: "6px", px: 1.25, py: 0.75 }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{n as number}</Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{label as string}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {canSetUp && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{custom ? "Custom wording for this agent" : "Standard wording"}</Typography>
            {custom && (
              <Button size="small" disabled={saving} onClick={() => save({ leadEmailBody: null }, "Back to the standard wording")}>
                Reset to standard
              </Button>
            )}
          </Box>
          <TextField
            multiline
            minRows={5}
            fullWidth
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            helperText={`Leave a blank line between paragraphs. ${LEAD_EMAIL_PLACEHOLDERS}.`}
            slotProps={{ htmlInput: { maxLength: 1500 } }}
          />
          <Button variant="contained" disabled={saving || !changed} onClick={saveWording} sx={{ alignSelf: "flex-start" }}>
            Save wording
          </Button>
        </Box>
      )}

      {/* What the lead receives, filled in with a sample lead. */}
      <Box>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.75 }}>Preview (sample lead)</Typography>
        <Box sx={{ border: `1px solid ${tokens.divider2}`, borderRadius: "6px", bgcolor: tokens.bg, p: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            From: <b>{fullName}</b> · Subject: Your home evaluation for {SAMPLE.address}
          </Typography>
          <Box sx={{ mt: 1.5, bgcolor: "background.paper", borderRadius: "4px", p: 1.5, fontSize: 14, lineHeight: 1.55, color: "#222" }}>
            <Typography sx={{ fontSize: 14, mb: 1.25 }}>Hi {SAMPLE.name},</Typography>
            {paragraphs.map((t, i) => (
              <Typography key={i} sx={{ fontSize: 14, mb: 1.25 }}>{t}</Typography>
            ))}
            <Typography sx={{ fontSize: 14, mb: 1.5 }}>
              If it&apos;s easier, you can <Link component="span" underline="always" sx={{ cursor: "default" }}>message me on WhatsApp here</Link>.
            </Typography>
            <Typography sx={{ fontSize: 14 }}>{first}</Typography>
            <Typography sx={{ fontSize: 12.5, color: "#555" }}>
              {fullName}{profile.company ? ` · ${profile.company}` : ""}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: "#555" }}>
              {[profile.whatsappNumber, profile.email].filter(Boolean).join(" · ")}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
