import { useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Switch,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import DoneAllIcon from "@mui/icons-material/DoneAll";
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
import type { AutomationRow, AutomationStepRow } from "../types/automations";
import type { LeadRow } from "../types";

const TRIGGER_LABEL: Record<string, string> = {
  lead_created: "When a lead is created",
  stage_changed: "When stage changes to",
  reminder_due: "When a reminder comes due",
};

function renderTemplate(text: string, lead: LeadRow): string {
  const fields: Record<string, string> = {
    name: lead.name,
    first_name: lead.name.split(" ")[0],
    phone: lead.phone,
    stage: lead.stage,
    next_label: lead.next_label,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => fields[key] ?? `{{${key}}}`);
}

/** Deterministic 4-char mock slug so the same lead always previews the same short link. */
function shortSlugFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36).padStart(4, "0").slice(0, 4);
}

/**
 * A 1:1 WhatsApp chat mockup so an operator can see exactly what the lead
 * receives, without opening the step editor — the short lead-action link is
 * a real link to /l/:leadId (the public, no-login-required page a tap on
 * WhatsApp lands on), built from a real lead so it's actually clickable to
 * preview here, not just decorative text.
 */
function WhatsAppPreview({ lead, text }: { lead: LeadRow | undefined; text: string | null }) {
  if (!lead || !text) return null;
  const body = renderTemplate(text, lead);
  const link = `ek.co/L/${shortSlugFor(lead.id)}`;
  return (
    <Box
      sx={{
        borderRadius: "8px",
        overflow: "hidden",
        border: `1px solid ${tokens.divider}`,
      }}
    >
      <Box sx={{ bgcolor: "#075e54", color: "#fff", px: 1.5, py: 1, fontSize: 12.5, fontWeight: 500 }}>WhatsApp preview</Box>
      <Box
        sx={{
          bgcolor: "#e5ddd5",
          backgroundImage:
            "radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px), radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0, 9px 9px",
          p: "14px 12px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Box
          sx={{
            maxWidth: "80%",
            bgcolor: "#dcf8c6",
            borderRadius: "8px",
            borderTopRightRadius: 0,
            p: "7px 9px 6px",
            boxShadow: "0 1px 1px rgba(0,0,0,.12)",
          }}
        >
          <Typography sx={{ fontSize: 13.5, color: "#111", whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
            {body}
            {"\n\n"}
            <Box component="a" href={`/l/${lead.id}`} target="_blank" rel="noopener" sx={{ color: "#0b57d0" }}>
              {link}
            </Box>
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 0.4, mt: 0.5 }}>
            <Typography sx={{ fontSize: 10.5, color: "rgba(0,0,0,.45)" }}>
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Typography>
            <DoneAllIcon sx={{ fontSize: 14, color: "#53bdeb" }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

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
  const previewLead = leads[0];

  return (
    <Box sx={{ maxWidth: 820, mx: "auto", pb: 4 }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Automations</Typography>
        </Toolbar>
      </AppBar>
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
              showSnack(`${a.name} ${enabled ? "enabled" : "disabled"}`);
            }}
          />
        ))
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

  return (
    <Box sx={{ m: "12px 16px 0", border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "14px 16px", cursor: "pointer" }} onClick={() => setExpanded((v) => !v)}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 500, fontSize: 15 }}>{automation.name}</Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
            {TRIGGER_LABEL[automation.trigger_type]}
            {automation.trigger_stage ? ` "${automation.trigger_stage}"` : ""} · {steps.length} step{steps.length === 1 ? "" : "s"}
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
          {whatsappSteps.map((s) => (
            <WhatsAppPreview key={s.id} lead={previewLead} text={s.template_text} />
          ))}
        </Box>
      )}

      {expanded && (
        <>
          <Divider />
          <Box sx={{ p: "8px 16px 16px" }}>
            {steps.map((s) => (
              <StepEditor key={s.id} step={s} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function StepEditor({ step }: { step: AutomationStepRow }) {
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
        <Chip size="small" label={`Step ${step.step_order}`} />
        <Chip size="small" label={step.action_type} variant="outlined" />
        <TextField
          size="small"
          type="number"
          label="Delay (minutes, after previous step)"
          value={delayMinutes}
          onChange={(e) => setDelayMinutes(Number(e.target.value))}
          sx={{ ml: "auto", width: 260 }}
        />
      </Box>

      {step.action_type === "send_whatsapp" ? (
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          label="Message ({{name}}, {{first_name}}, {{phone}}, {{stage}}, {{next_label}})"
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
