import { useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { usePostHog } from "@posthog/react";
import { tokens } from "../theme";
import {
  useAutomations,
  useAutomationSteps,
  useIsOperator,
  useToggleAutomation,
  useUpdateAutomationStep,
} from "../hooks/useAutomations";
import { useLeads } from "../hooks/useLeads";
import { useSnack } from "../hooks/useSnack";
import ScheduledAutomations from "../components/ScheduledAutomations";
import WhatsAppPreview from "../components/WhatsAppPreview";
import type { AutomationRow, AutomationStepRow } from "../types/automations";
import type { LeadRow } from "../types";

const TRIGGER_LABEL: Record<string, string> = {
  lead_created: "When a lead is created",
  stage_changed: "When stage changes to",
  reminder_due: "When a reminder comes due",
  // Not per-lead like the others: one message per agent, each weekday at 16:00.
  daily_digest: "Every weekday at 16:00",
};

export default function AdminAutomationsPage() {
  const { data: isOperator, isLoading: loadingOperator } = useIsOperator();

  if (loadingOperator) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isOperator) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          Access restricted
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Automations are managed by the operator only.
        </Typography>
      </Box>
    );
  }

  return <AutomationsAdmin />;
}

function AutomationsAdmin() {
  const { data: automations = [], isLoading } = useAutomations();
  const { data: steps = [] } = useAutomationSteps();
  const { data: leads = [] } = useLeads();
  const toggle = useToggleAutomation();
  const showSnack = useSnack();
  const posthog = usePostHog();
  const previewLead = leads[0];
  const [tab, setTab] = useState<"scheduled" | "setup">("scheduled");

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Automations</Typography>
        </Toolbar>
      </AppBar>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, minHeight: 44, px: 1 }}
      >
        <Tab label="Scheduled" value="scheduled" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
        <Tab label="Setup" value="setup" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
      </Tabs>
      {tab === "scheduled" ? (
        <Box sx={{ maxWidth: 820, mx: "auto" }}>
          <ScheduledAutomations />
        </Box>
      ) : (
      <Box sx={{ maxWidth: 820, mx: "auto", pb: 4 }}>
      <Typography variant="body2" color="text.secondary" sx={{ p: "16px 16px 0" }}>
        The lead-follow-up SOP, running automatically. Agents never see this — messages go to the agent's own WhatsApp
        as a nudge about their lead.
      </Typography>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        automations.map((a) => (
          <AutomationCard
            key={a.id}
            automation={a}
            steps={steps.filter((s) => s.automation_id === a.id)}
            previewLead={previewLead}
            onToggle={(enabled) => {
              toggle.mutate({ id: a.id, enabled });
              posthog.capture("automation_toggled", { automation: a.name, enabled });
              showSnack(`${a.name} ${enabled ? "enabled" : "disabled"}`);
            }}
          />
        ))
      )}
      </Box>
      )}
    </Box>
  );
}

function AutomationCard({
  automation,
  steps,
  previewLead,
  onToggle,
}: {
  automation: AutomationRow;
  steps: AutomationStepRow[];
  previewLead: LeadRow | undefined;
  onToggle: (enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const whatsappSteps = steps.filter((s) => s.action_type === "send_whatsapp");
  const isDigest = automation.trigger_type === "daily_digest";

  return (
    <Box sx={{ m: "12px 16px 0", border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "14px 16px", cursor: "pointer" }} onClick={() => setExpanded((v) => !v)}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 500, fontSize: 15 }}>{automation.name}</Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
            {TRIGGER_LABEL[automation.trigger_type]}
            {automation.trigger_stage ? ` "${automation.trigger_stage}"` : ""}
            {/* "1 step" is noise for the digest — it's one message, always. */}
            {isDigest ? " · one message per agent" : ` · ${steps.length} step${steps.length === 1 ? "" : "s"}`}
          </Typography>
        </Box>
        <Chip size="small" label={automation.enabled ? "Enabled" : "Disabled"} color={automation.enabled ? "success" : "default"} variant="outlined" />
        <Switch
          checked={automation.enabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </Box>

      {whatsappSteps.length > 0 && (
        <Box sx={{ px: 2, pb: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {isDigest && (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
              Goes to each agent once a day, only if they actually have leads waiting.
              Nobody with an empty list gets a message.
            </Typography>
          )}
          {whatsappSteps.map((s) => (
            <WhatsAppPreview
              key={s.id}
              lead={previewLead}
              text={s.template_text}
              // This one is addressed to the agent about a count of leads, so
              // the usual lead-based preview values would be misleading.
              sampleFields={isDigest ? { first_name: "James", count: "7", leads_word: "leads" } : undefined}
            />
          ))}
        </Box>
      )}

      {expanded && (
        <>
          <Divider />
          <Box sx={{ p: "8px 16px 16px" }}>
            {steps.map((s) => (
              <StepEditor key={s.id} step={s} hideDelay={isDigest} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function StepEditor({ step, hideDelay = false }: { step: AutomationStepRow; hideDelay?: boolean }) {
  const update = useUpdateAutomationStep();
  const showSnack = useSnack();
  const [delayMinutes, setDelayMinutes] = useState(step.delay_minutes);
  const [templateText, setTemplateText] = useState(step.template_text ?? "");
  const [payloadText, setPayloadText] = useState(JSON.stringify(step.payload ?? {}, null, 2));
  const [payloadError, setPayloadError] = useState("");

  function save() {
    let payload: Record<string, unknown> = {};
    if (step.action_type !== "send_whatsapp") {
      try {
        payload = payloadText.trim() ? JSON.parse(payloadText) : {};
        setPayloadError("");
      } catch {
        setPayloadError("Invalid JSON");
        return;
      }
    }
    update.mutate(
      { id: step.id, delay_minutes: delayMinutes, template_text: step.action_type === "send_whatsapp" ? templateText : null, payload },
      { onSuccess: () => showSnack("Step saved"), onError: () => showSnack("Could not save step") },
    );
  }

  return (
    <Box sx={{ py: 1.5, borderTop: `1px solid ${tokens.divider2}`, "&:first-of-type": { borderTop: 0 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        {!hideDelay && <Chip size="small" label={`Step ${step.step_order}`} />}
        <Chip size="small" label={step.action_type} variant="outlined" />
        {/* The digest runs on a fixed daily schedule — a per-step delay would
            do nothing, so showing the field would just invite confusion. */}
        {!hideDelay && (
          <TextField
            size="small"
            type="number"
            label="Delay (minutes, after previous step)"
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(Number(e.target.value))}
            sx={{ ml: "auto", width: 260 }}
          />
        )}
      </Box>

      {step.action_type === "send_whatsapp" ? (
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          label={hideDelay
            ? "Message ({{first_name}}, {{count}}, {{leads_word}})"
            : "Message ({{name}}, {{first_name}}, {{phone}}, {{stage}}, {{next_label}})"}
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
        />
      ) : (
        <TextField
          fullWidth
          multiline
          minRows={3}
          size="small"
          label={`Payload JSON (${step.action_type === "set_reminder" ? "label, offset_minutes, due" : "stage"})`}
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          error={!!payloadError}
          helperText={payloadError}
          sx={{ fontFamily: "monospace" }}
        />
      )}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
        <Button size="small" variant="contained" disabled={update.isPending} onClick={save}>
          Save step
        </Button>
      </Box>
    </Box>
  );
}
