import { useEffect, useState } from "react";
import { Box, Button, IconButton, List, ListItemButton, ListItemIcon, ListItemText, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { defaultReminderISO, MAIN_OUTCOME_OPTIONS, STEP_FOR_STAGE, type MainOutcomeOption } from "../lib/stageLogic";
import { useUpdateLeadStage } from "../hooks/useLeads";
import { OUTCOME_ICONS, outcomeSnack } from "./OutcomeSheet";
import type { LeadRow, OutcomeStep, PipelineKind, Stage, StageChangeExtra } from "../types";

/**
 * The "how did it go?" flow, embedded directly in the page instead of a
 * bottom-sheet overlay — used on the full-screen focus-call flow and on a
 * lead's own page, both of which already have their own chrome (no separate
 * title bar / close button here, just a back arrow once past the main list).
 */
export default function OutcomeOptionsInline({
  lead,
  pipelineKind,
  dark = false,
  resetKey,
  onDone,
}: {
  lead: LeadRow;
  /** Which pipeline the lead belongs to — drives the option wording/targets. */
  pipelineKind: PipelineKind;
  /** Dark styling for the full-screen focus-call flow; light for a normal page. */
  dark?: boolean;
  /** Changing this value resets back to the main list — pass the thing that
   * identifies "a fresh call to log" (e.g. the lead id, or a call-session counter). */
  resetKey: unknown;
  onDone: (msg: string) => void;
}) {
  const [step, setStep] = useState<OutcomeStep>("main");
  const [targetStage, setTargetStage] = useState<Stage | null>(null);
  const updateStage = useUpdateLeadStage();

  useEffect(() => {
    setStep("main");
    setTargetStage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function resolve(stage: Stage, extra?: StageChangeExtra | number) {
    updateStage.mutate({ id: lead.id, stage, extra });
    onDone(outcomeSnack(stage));
  }
  function pickMain(option: MainOutcomeOption) {
    const subStep = STEP_FOR_STAGE[option.stage];
    if (subStep) {
      setTargetStage(option.stage);
      setStep(subStep);
      return;
    }
    resolve(option.stage);
  }

  const stage = targetStage;
  const ink = dark ? "#fff" : "text.primary";
  const inkSecondary = dark ? "#90a4ae" : "text.secondary";
  const rowBorder = dark ? "rgba(255,255,255,.08)" : "divider";

  const headings: Record<OutcomeStep, string> = {
    main: "After the call, tap what happened",
    booked: stage === "Viewing Booked" ? "When is the viewing?" : "When is the appointment?",
    reminder: "When should we remind you?",
    commission: "What's the commission?",
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        {step !== "main" && (
          <IconButton size="small" onClick={() => { setStep("main"); setTargetStage(null); }} sx={{ color: ink, ml: -1 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        <Typography sx={{ fontSize: 11, color: inkSecondary, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          {headings[step]}
        </Typography>
      </Box>

      {step === "main" && (
        <List disablePadding sx={{ borderRadius: "8px", overflow: "hidden", bgcolor: dark ? "rgba(255,255,255,.04)" : "background.paper" }}>
          {MAIN_OUTCOME_OPTIONS[pipelineKind].map((opt, i) => (
            <ListItemButton
              key={opt.label}
              onClick={() => pickMain(opt)}
              sx={{ borderTop: i ? `1px solid ${rowBorder}` : 0, py: 1.4, px: 1.75 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: inkSecondary }}>{OUTCOME_ICONS[opt.icon]}</ListItemIcon>
              <ListItemText slotProps={{ primary: { sx: { fontSize: 14.5, color: ink } } }}>{opt.label}</ListItemText>
            </ListItemButton>
          ))}
        </List>
      )}

      {step === "booked" && stage && (
        <ChipList
          dark={dark}
          options={[
            ["Tomorrow morning", "Tomorrow AM", 1],
            ["Tomorrow afternoon", "Tomorrow PM", 1],
            ["Later this week", "This week", 3],
          ]}
          onPick={(tag, days) => resolve(stage, { label: tag, at: defaultReminderISO(days) })}
          dateLabel="Set date"
          onSetDate={(d) => resolve(stage, { label: "Appt " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), at: d.toISOString() })}
        />
      )}

      {step === "reminder" && stage && (
        <ChipList
          dark={dark}
          options={[
            ["Tomorrow", "tomorrow", 1],
            ["In 2 days", "in 2 days", 2],
            ["Next week", "next week", 7],
          ]}
          onPick={(tag, days) => resolve(stage, { label: tag, at: defaultReminderISO(days) })}
          dateLabel="Set"
          onSetDate={(d) => resolve(stage, { label: "on " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), at: d.toISOString() })}
          extra={{ label: "No reminder", onClick: () => resolve(stage, { label: "no reminder", at: null }) }}
        />
      )}

      {step === "commission" && stage && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <CommissionInput dark={dark} onSave={(v) => resolve(stage, v)} />
          </Box>
          <ChipList
            dark={dark}
            options={[
              ["R25,000", "", 25000],
              ["R45,000", "", 45000],
              ["R75,000", "", 75000],
            ]}
            onPick={(_tag, amount) => resolve(stage, amount)}
          />
        </Box>
      )}
    </Box>
  );
}

function ChipList({
  dark,
  options,
  onPick,
  dateLabel,
  onSetDate,
  extra,
}: {
  dark: boolean;
  options: [string, string, number][];
  onPick: (tag: string, value: number) => void;
  dateLabel?: string;
  onSetDate?: (d: Date) => void;
  extra?: { label: string; onClick: () => void };
}) {
  const rowBorder = dark ? "rgba(255,255,255,.08)" : "divider";
  const ink = dark ? "#fff" : "text.primary";
  const inkSecondary = dark ? "#90a4ae" : "text.secondary";
  const [val, setVal] = useState("");
  return (
    <List disablePadding sx={{ borderRadius: "8px", overflow: "hidden", bgcolor: dark ? "rgba(255,255,255,.04)" : "background.paper" }}>
      {options.map(([label, tag, value], i) => (
        <ListItemButton key={label} onClick={() => onPick(tag, value)} sx={{ borderTop: i ? `1px solid ${rowBorder}` : 0, py: 1.4, px: 1.75 }}>
          <ListItemText slotProps={{ primary: { sx: { fontSize: 14.5, color: ink } } }}>{label}</ListItemText>
        </ListItemButton>
      ))}
      {onSetDate && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", p: "10px 14px", borderTop: `1px solid ${rowBorder}` }}>
          <TextField
            size="small"
            type="date"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            fullWidth
            sx={dark ? { input: { color: "#eceff1" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,.14)" } } : undefined}
          />
          <Button variant="contained" onClick={() => val && onSetDate(new Date(val))}>
            {dateLabel}
          </Button>
        </Box>
      )}
      {extra && (
        <ListItemButton onClick={extra.onClick} sx={{ borderTop: `1px solid ${rowBorder}`, py: 1.4, px: 1.75 }}>
          <ListItemText slotProps={{ primary: { sx: { fontSize: 14.5, color: inkSecondary } } }}>{extra.label}</ListItemText>
        </ListItemButton>
      )}
    </List>
  );
}

function CommissionInput({ dark, onSave }: { dark: boolean; onSave: (v: number) => void }) {
  const [val, setVal] = useState("");
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flex: 1 }}>
      <TextField
        size="small"
        placeholder="45000"
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))}
        fullWidth
        sx={dark ? { input: { color: "#eceff1" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,.14)" } } : undefined}
      />
      <Button variant="contained" onClick={() => onSave(val ? +val : 0)}>
        Save
      </Button>
    </Box>
  );
}
