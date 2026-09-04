import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { usePostHog } from "@posthog/react";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EventIcon from "@mui/icons-material/Event";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import PhoneDisabledIcon from "@mui/icons-material/PhoneDisabled";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import BlockIcon from "@mui/icons-material/Block";
import CloseFullscreenIcon from "@mui/icons-material/CallEnd";
import { defaultReminderISO, MAIN_OUTCOME_OPTIONS, STEP_FOR_STAGE, type MainOutcomeOption } from "../lib/stageLogic";
import { useUpdateLeadStage } from "../hooks/useLeads";
import type { LeadRow, OutcomeStep, PipelineKind, Stage, StageChangeExtra } from "../types";

export const OUTCOME_ICONS: Record<MainOutcomeOption["icon"], React.ReactNode> = {
  event: <EventIcon />,
  chat: <ChatBubbleOutlineIcon />,
  no_answer: <PhoneDisabledIcon />,
  premium: <WorkspacePremiumIcon />,
  offer: <RequestQuoteIcon />,
  block: <BlockIcon />,
  wrong_number: <CloseFullscreenIcon />,
};

export default function OutcomeSheet({
  lead,
  pipelineKind = "seller",
  open,
  onClose,
  onLogged,
  onSnack,
  entryStep = "main",
  entryStage,
}: {
  lead: LeadRow | undefined;
  /** Which pipeline the lead belongs to — drives the "how did it go?" wording/targets. */
  pipelineKind?: PipelineKind;
  open: boolean;
  onClose: () => void;
  onLogged?: () => void;
  onSnack: (msg: string) => void;
  /** Open directly at a sub-step (e.g. "booked") instead of the "how did it
   * go" list — used when the stage was already picked from a stage menu, so
   * we don't re-ask something already answered. Back from this step closes
   * the sheet instead of returning to "main" (which was never shown). */
  entryStep?: OutcomeStep;
  /** The exact stage the sub-step should resolve to when entered directly
   * (e.g. "Viewing Booked" vs "Booked") — required whenever entryStep isn't "main". */
  entryStage?: Stage;
}) {
  const isDesktop = useMediaQuery("(min-width:600px)");
  const [step, setStep] = useState<OutcomeStep>(entryStep);
  const [targetStage, setTargetStage] = useState<Stage | null>(entryStage ?? null);
  const updateStage = useUpdateLeadStage();
  const posthog = usePostHog();

  useEffect(() => {
    if (open) {
      setStep(entryStep);
      setTargetStage(entryStep === "main" ? null : entryStage ?? null);
    }
  }, [open, entryStep, entryStage]);

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
  function commitStage(toStage: Stage, extra?: StageChangeExtra | number) {
    posthog.capture("lead_stage_changed", { pipeline: pipelineKind, from: lead!.stage, to: toStage });
    updateStage.mutate({ id: lead!.id, stage: toStage, extra });
    finish(outcomeSnack(toStage));
  }
  function pickMain(option: MainOutcomeOption) {
    const subStep = STEP_FOR_STAGE[option.stage];
    if (subStep) {
      setTargetStage(option.stage);
      setStep(subStep);
      return;
    }
    commitStage(option.stage);
  }

  if (!lead) return null;
  const firstName = lead.name.split(" ")[0];
  const stage = targetStage;

  const titles: Record<OutcomeStep, { title: string; sub: string }> = {
    main: { title: `How did it go with ${firstName}?`, sub: "Tap what happened." },
    booked: {
      title: stage === "Viewing Booked" ? "When is the viewing?" : "When is the appointment?",
      sub: "We'll remind you before it.",
    },
    reminder: { title: "When should we remind you?", sub: `We'll put ${firstName} back at the top that day.` },
    commission: { title: "What's the commission?", sub: "Type the amount so it shows on your numbers." },
  };
  const t = titles[step];
  const showBack = step !== entryStep;

  const content = (
    <>
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
          {MAIN_OUTCOME_OPTIONS[pipelineKind].map((opt) => (
            <Opt key={opt.label} icon={OUTCOME_ICONS[opt.icon]} label={opt.label} onClick={() => pickMain(opt)} />
          ))}
        </List>
      )}

      {step === "booked" && stage && (
        <Box sx={{ pb: 1 }}>
          {[
            ["Tomorrow morning", "Tomorrow AM", 1],
            ["Tomorrow afternoon", "Tomorrow PM", 1],
            ["Later this week", "This week", 3],
          ].map(([label, tag, days]) => (
            <Opt
              key={label as string}
              label={label as string}
              onClick={() => commitStage(stage, { label: tag as string, at: defaultReminderISO(days as number) })}
            />
          ))}
          <DatePickerRow
            buttonLabel="Set date"
            onSet={(d) => {
              const lbl = "Appt " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
              commitStage(stage, { label: lbl, at: d.toISOString() });
            }}
          />
        </Box>
      )}

      {step === "reminder" && stage && (
        <Box sx={{ pb: 1 }}>
          {[
            ["Tomorrow", "tomorrow", 1],
            ["In 2 days", "in 2 days", 2],
            ["Next week", "next week", 7],
          ].map(([label, tag, days]) => (
            <Opt
              key={label as string}
              label={label as string}
              onClick={() => commitStage(stage, { label: tag as string, at: defaultReminderISO(days as number) })}
            />
          ))}
          <DatePickerRow
            buttonLabel="Set"
            onSet={(d) => {
              const lbl = "on " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
              commitStage(stage, { label: lbl, at: d.toISOString() });
            }}
          />
          <Opt label="No reminder" onClick={() => commitStage(stage, { label: "no reminder", at: null })} />
        </Box>
      )}

      {step === "commission" && stage && (
        <Box sx={{ pb: 1.5 }}>
          <CommissionInput onSave={(v) => commitStage(stage, v)} />
          {[25000, 45000, 75000].map((a) => (
            <Opt key={a} label={"R" + a.toLocaleString()} onClick={() => commitStage(stage, a)} />
          ))}
        </Box>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onClose={close}
        maxWidth="xs"
        fullWidth
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        {content}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={close}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      slotProps={{ paper: { sx: { borderRadius: "8px 8px 0 0", maxWidth: 480, mx: "auto" } } }}
    >
      {content}
    </Drawer>
  );
}

export function outcomeSnack(stage: Stage): string {
  switch (stage) {
    case "No Answer":
      return "Retry reminder set";
    case "Lost":
      return "Marked as lost";
    case "Invalid Number":
      return "Marked invalid";
    case "Booked":
    case "Viewing Booked":
      return "Booked · reminder set";
    case "Contacted":
    case "Offer Made":
      return "Follow-up reminder set";
    case "Mandate Signed":
    case "Bought":
      return "Deal logged";
    default:
      return "Updated";
  }
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
