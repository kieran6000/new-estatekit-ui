import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EventIcon from "@mui/icons-material/Event";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import PhoneDisabledIcon from "@mui/icons-material/PhoneDisabled";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import BlockIcon from "@mui/icons-material/Block";
import CloseFullscreenIcon from "@mui/icons-material/CallEnd";
import { defaultReminderISO } from "../lib/stageLogic";
import { useUpdateLeadStage } from "../hooks/useLeads";
import type { LeadRow, OutcomeStep } from "../types";

export default function OutcomeSheet({
  lead,
  open,
  onClose,
  onLogged,
  onSnack,
  entryStep = "main",
}: {
  lead: LeadRow | undefined;
  open: boolean;
  onClose: () => void;
  onLogged?: () => void;
  onSnack: (msg: string) => void;
  /** Open directly at a sub-step (e.g. "booked") instead of the "how did it
   * go" list — used when the stage was already picked from a stage menu, so
   * we don't re-ask something already answered. Back from this step closes
   * the sheet instead of returning to "main" (which was never shown). */
  entryStep?: OutcomeStep;
}) {
  const [step, setStep] = useState<OutcomeStep>(entryStep);
  const updateStage = useUpdateLeadStage();

  useEffect(() => {
    if (open) setStep(entryStep);
  }, [open, entryStep]);

  function close() {
    onClose();
  }
  function finish(msg: string) {
    onSnack(msg);
    onClose();
    onLogged?.();
  }
  function goBack() {
    if (step === entryStep) {
      close();
    } else {
      setStep(entryStep);
    }
  }

  if (!lead) return null;
  const firstName = lead.name.split(" ")[0];

  const titles: Record<OutcomeStep, { title: string; sub: string }> = {
    main: { title: `How did it go with ${firstName}?`, sub: "Tap what happened." },
    booked: { title: "When is the appointment?", sub: "We'll remind you before it." },
    reminder: { title: "When should we remind you?", sub: `We'll put ${firstName} back at the top that day.` },
    commission: { title: "What's the commission?", sub: "Type the amount so it shows on your numbers." },
  };
  const t = titles[step];
  const showBack = step !== "main";

  return (
    <Drawer anchor="bottom" open={open} onClose={close} slotProps={{ paper: { sx: { borderRadius: "8px 8px 0 0", maxWidth: 480, mx: "auto" } } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, p: "8px 8px 4px 16px" }}>
        {showBack && (
          <IconButton onClick={goBack}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 500, fontSize: 17 }}>
          {t.title}
        </Typography>
        <IconButton onClick={close}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.25 }}>
        {t.sub}
      </Typography>

      {step === "main" && (
        <List disablePadding>
          <Opt icon={<EventIcon />} label="Booked an appointment" onClick={() => setStep("booked")} />
          <Opt icon={<ChatBubbleOutlineIcon />} label="Spoke — following up" onClick={() => setStep("reminder")} />
          <Opt
            icon={<PhoneDisabledIcon />}
            label="No answer"
            onClick={() => {
              updateStage.mutate({ id: lead.id, stage: "No Answer" });
              finish("Retry reminder set");
            }}
          />
          <Opt icon={<WorkspacePremiumIcon />} label="Signed the mandate" onClick={() => setStep("commission")} />
          <Opt
            icon={<BlockIcon />}
            label="Not selling"
            onClick={() => {
              updateStage.mutate({ id: lead.id, stage: "Lost" });
              finish("Marked as lost");
            }}
          />
          <Opt
            icon={<CloseFullscreenIcon />}
            label="Wrong number"
            onClick={() => {
              updateStage.mutate({ id: lead.id, stage: "Invalid Number" });
              finish("Marked invalid");
            }}
          />
        </List>
      )}

      {step === "booked" && (
        <Box sx={{ pb: 1 }}>
          {[
            ["Tomorrow morning", "Tomorrow AM", 1],
            ["Tomorrow afternoon", "Tomorrow PM", 1],
            ["Later this week", "This week", 3],
          ].map(([label, tag, days]) => (
            <Opt
              key={label as string}
              label={label as string}
              onClick={() => {
                updateStage.mutate({ id: lead.id, stage: "Booked", extra: { label: tag as string, at: defaultReminderISO(days as number) } });
                finish("Booked · reminder set");
              }}
            />
          ))}
          <DatePickerRow
            buttonLabel="Set date"
            onSet={(d) => {
              const lbl = "Appt " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
              updateStage.mutate({ id: lead.id, stage: "Booked", extra: { label: lbl, at: d.toISOString() } });
              finish("Booked · reminder set");
            }}
          />
        </Box>
      )}

      {step === "reminder" && (
        <Box sx={{ pb: 1 }}>
          {[
            ["Tomorrow", "tomorrow", 1],
            ["In 2 days", "in 2 days", 2],
            ["Next week", "next week", 7],
          ].map(([label, tag, days]) => (
            <Opt
              key={label as string}
              label={label as string}
              onClick={() => {
                updateStage.mutate({ id: lead.id, stage: "Contacted", extra: { label: tag as string, at: defaultReminderISO(days as number) } });
                finish("Follow-up reminder set");
              }}
            />
          ))}
          <DatePickerRow
            buttonLabel="Set"
            onSet={(d) => {
              const lbl = "on " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
              updateStage.mutate({ id: lead.id, stage: "Contacted", extra: { label: lbl, at: d.toISOString() } });
              finish("Follow-up reminder set");
            }}
          />
          <Opt
            label="No reminder"
            onClick={() => {
              updateStage.mutate({ id: lead.id, stage: "Contacted", extra: { label: "no reminder", at: null } });
              finish("Marked contacted");
            }}
          />
        </Box>
      )}

      {step === "commission" && (
        <Box sx={{ pb: 1.5 }}>
          <CommissionInput
            onSave={(v) => {
              updateStage.mutate({ id: lead.id, stage: "Mandate Signed", extra: v });
              finish("Mandate logged");
            }}
          />
          {[25000, 45000, 75000].map((a) => (
            <Opt
              key={a}
              label={"R" + a.toLocaleString()}
              onClick={() => {
                updateStage.mutate({ id: lead.id, stage: "Mandate Signed", extra: a });
                finish("Mandate logged");
              }}
            />
          ))}
        </Box>
      )}
    </Drawer>
  );
}

function Opt({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <ListItemButton onClick={onClick} sx={{ borderTop: "1px solid", borderColor: "divider", py: 1.75, px: 2 }}>
      {icon && <ListItemIcon sx={{ minWidth: 40, color: "text.secondary" }}>{icon}</ListItemIcon>}
      <ListItemText slotProps={{ primary: { sx: { fontSize: 15 } } }}>{label}</ListItemText>
    </ListItemButton>
  );
}

function DatePickerRow({ buttonLabel, onSet }: { buttonLabel: string; onSet: (d: Date) => void }) {
  const [val, setVal] = useState("");
  return (
    <Box sx={{ display: "flex", gap: 1, px: 2, py: 1, alignItems: "center" }}>
      <TextField size="small" type="date" value={val} onChange={(e) => setVal(e.target.value)} fullWidth />
      <Button
        variant="contained"
        onClick={() => {
          if (!val) return;
          onSet(new Date(val));
        }}
      >
        {buttonLabel}
      </Button>
    </Box>
  );
}

function CommissionInput({ onSave }: { onSave: (v: number) => void }) {
  const [val, setVal] = useState("");
  return (
    <Box sx={{ display: "flex", gap: 1, px: 2, py: 1, alignItems: "center" }}>
      <TextField size="small" placeholder="45000" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))} fullWidth />
      <Button variant="contained" onClick={() => onSave(val ? +val : 0)}>
        Save
      </Button>
    </Box>
  );
}
