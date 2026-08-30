import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  IconButton,
  InputBase,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CallIcon from "@mui/icons-material/Call";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { tokens } from "../theme";
import { STAGES, DEAD_STAGES, type LeadRow, type OutcomeStep, type Stage } from "../types";
import { dueLeads, sortLeadsForList, STEP_FOR_STAGE } from "../lib/stageLogic";
import { useLeads, useUpdateLeadStage } from "../hooks/useLeads";
import { useSetupSteps } from "../hooks/useSetupSteps";
import { useStatStripCpl } from "../hooks/useOverview";
import { useSnack } from "../hooks/useSnack";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import FocusCallModal from "../components/FocusCallModal";

export default function LeadsPage() {
  const navigate = useNavigate();
  const { data: leads = [] } = useLeads();
  const { data: steps = [] } = useSetupSteps();
  const { data: cpl = 0 } = useStatStripCpl();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();

  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"All" | Stage>("All");
  const [outcomeLeadId, setOutcomeLeadId] = useState<string | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [stageSheet, setStageSheet] = useState<{ leadId: string; step: OutcomeStep } | null>(null);

  const due = useMemo(() => dueLeads(leads), [leads]);
  const remCount = due.filter((l) => l.reminder_at).length;
  const freshCount = due.length - remCount;

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return sortLeadsForList(leads).filter((l) => {
      if (filter !== "All" && l.stage !== filter) return false;
      if (!query) return true;
      return l.name.toLowerCase().includes(query) || l.phone.replace(/\s/g, "").includes(query.replace(/\s/g, ""));
    });
  }, [leads, filter, q]);

  const stepsLeft = steps.length ? steps.filter((s) => !s.done).length : 0;
  const outcomeLead = leads.find((l) => l.id === outcomeLeadId);
  const stageSheetLead = leads.find((l) => l.id === stageSheet?.leadId);

  function handleStagePick(id: string, stage: Stage) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const step = STEP_FOR_STAGE[stage];
    if (step) {
      setStageSheet({ leadId: id, step });
      return;
    }
    const prev = { stage: lead.stage, next_label: lead.next_label, due: lead.due, reminder_at: lead.reminder_at, commission: lead.commission };
    updateStage.mutate({ id, stage });
    showSnack(`${lead.name.split(" ")[0]} moved to ${stage}`, () =>
      updateStage.mutate({ id, stage: prev.stage, override: prev }),
    );
  }

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", px: "8px 8px 8px 16px" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Leads</Typography>
          <IconButton onClick={() => setSearchOpen((v) => !v)}>
            <SearchIcon />
          </IconButton>
          <Avatar sx={{ width: 32, height: 32, bgcolor: tokens.primary, fontSize: 14, ml: 0.5 }}>K</Avatar>
        </Toolbar>
      </AppBar>

      {searchOpen && (
        <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, display: "flex", alignItems: "center", gap: 1.25, p: "10px 16px" }}>
          <SearchIcon sx={{ color: "text.disabled" }} />
          <InputBase placeholder="Search leads" value={q} onChange={(e) => setQ(e.target.value)} fullWidth autoFocus />
        </Box>
      )}

      {stepsLeft > 0 && (
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1.75, bgcolor: "#fff8e1", borderBottom: "1px solid #ffe082", p: "14px 16px" }}
        >
          <WarningAmberIcon sx={{ color: "#f57c00" }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 500, fontSize: 15 }}>You're not live yet</Typography>
            <Typography sx={{ color: "text.secondary", fontSize: 13 }}>{stepsLeft} setup step{stepsLeft > 1 ? "s" : ""} left.</Typography>
          </Box>
          <Box
            component="button"
            onClick={() => navigate("/home")}
            sx={{ border: 0, bgcolor: "transparent", color: tokens.primary, fontWeight: 500, fontSize: 14, textTransform: "uppercase", cursor: "pointer" }}
          >
            Finish setup
          </Box>
        </Box>
      )}

      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, display: "flex", alignItems: "center", gap: 1.75, p: "14px 16px" }}>
        <NotificationsIcon sx={{ color: due.length ? tokens.primary : tokens.green }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 500, fontSize: 15 }}>
            {due.length === 0 ? "You're all caught up" : `${due.length} to call today`}
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
            {due.length === 0
              ? "No one to call today."
              : [freshCount && `${freshCount} new`, remCount && `${remCount} follow-up${remCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        {due.length > 0 && (
          <Box
            component="button"
            onClick={() => setFocusOpen(true)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              border: 0,
              bgcolor: "transparent",
              color: tokens.primary,
              fontWeight: 500,
              fontSize: 14,
              textTransform: "uppercase",
              px: 1.5,
              py: 1,
              borderRadius: "4px",
              cursor: "pointer",
              "&:hover": { bgcolor: tokens.primaryBg },
            }}
          >
            <CallIcon fontSize="small" /> Start calling
          </Box>
        )}
      </Box>

      <Box
        onClick={() => navigate("/overview")}
        sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, fontSize: 13, color: "text.secondary", cursor: "pointer", "&:hover": { bgcolor: tokens.hover } }}
      >
        <span><b style={{ color: tokens.ink }}>{leads.length}</b> leads</span>
        <span style={{ color: tokens.ink3 }}>·</span>
        <span><b style={{ color: tokens.ink }}>R{cpl}</b> each</span>
        <span style={{ color: tokens.ink3 }}>·</span>
        <span><b style={{ color: tokens.ink }}>{leads.filter((l) => l.stage === "Mandate Signed").length}</b> mandate</span>
        <span style={{ marginLeft: "auto", color: tokens.primary, fontWeight: 500 }}>Full numbers ›</span>
      </Box>

      <Box sx={{ display: "flex", gap: 1, p: "10px 16px", overflowX: "auto", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        {(["All", ...STAGES] as const).map((s) => (
          <Chip
            key={s}
            label={s === "Mandate Signed" ? "Mandate" : s}
            onClick={() => setFilter(s)}
            variant={filter === s ? "filled" : "outlined"}
            sx={
              filter === s
                ? { bgcolor: tokens.primaryBg, borderColor: tokens.primary, color: tokens.primaryDark, fontWeight: 500 }
                : { borderColor: "#bdbdbd", color: "text.secondary" }
            }
          />
        ))}
      </Box>

      <LeadsTable
        leads={filtered}
        filter={filter}
        onOpen={(id) => navigate(`/leads/${id}`)}
        onCall={(id) => setOutcomeLeadId(id)}
        onStagePick={handleStagePick}
      />

      <Typography variant="caption" sx={{ display: "block", p: "12px 16px", color: "text.disabled" }}>
        Tap a name to open the lead. Tap CALL, then log what happened — we set the reminder for you.
      </Typography>

      <OutcomeSheet
        lead={outcomeLead}
        open={!!outcomeLeadId}
        onClose={() => setOutcomeLeadId(null)}
        onSnack={showSnack}
      />
      <OutcomeSheet
        lead={stageSheetLead}
        open={!!stageSheet}
        entryStep={stageSheet?.step ?? "main"}
        onClose={() => setStageSheet(null)}
        onSnack={showSnack}
      />
      <FocusCallModal leads={leads} open={focusOpen} onClose={() => setFocusOpen(false)} onSnack={showSnack} />
    </Box>
  );
}

function LeadsTable({
  leads,
  filter,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  filter: "All" | Stage;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  const isMobile = useMediaQuery("(max-width:639px)");
  if (isMobile) {
    return <MobileLeadsList leads={leads} filter={filter} onOpen={onOpen} onCall={onCall} onStagePick={onStagePick} />;
  }

  const grouped = filter === "All";

  const rows = (group: LeadRow[]) =>
    group.map((l) => (
      <TableRow key={l.id} hover sx={l.due && !DEAD_STAGES.includes(l.stage) ? { bgcolor: tokens.amberTint } : DEAD_STAGES.includes(l.stage) ? { color: tokens.ink3 } : undefined}>
        <TableCell sx={{ py: 1 }}>
          <Box component="span" onClick={() => onOpen(l.id)} sx={{ fontWeight: 500, fontSize: 15, color: tokens.primaryDark, cursor: "pointer" }}>
            {l.name}
            {l.stage === "New Lead" && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: tokens.green, ml: 0.75 }}>NEW</Box>}
          </Box>
          <Typography sx={{ color: "text.secondary", fontSize: 13, display: "block" }}>{l.phone}</Typography>
        </TableCell>
        <TableCell>
          <StageMenu current={l.stage} onPick={(s) => onStagePick(l.id, s)}>
            {(open) => (
              <Box
                component="button"
                onClick={open}
                sx={{ border: 0, bgcolor: "transparent", fontSize: 14, color: "inherit", display: "inline-flex", alignItems: "center", gap: 0.75, cursor: "pointer", p: "6px 0" }}
              >
                {l.stage}
              </Box>
            )}
          </StageMenu>
        </TableCell>
        <TableCell>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13, color: l.reminder_at ? "#e65100" : "text.secondary" }}>
            {l.reminder_at && <AccessTimeIcon sx={{ fontSize: 14 }} />}
            {l.next_label}
          </Box>
        </TableCell>
        <TableCell align="right">
          {!DEAD_STAGES.includes(l.stage) && (
            <Box
              component="a"
              href={`tel:${l.phone.replace(/\s/g, "")}`}
              onClick={() => setTimeout(() => onCall(l.id), 150)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                bgcolor: tokens.green,
                color: "#fff",
                borderRadius: "4px",
                p: "8px 14px",
                fontWeight: 500,
                fontSize: 13,
                textTransform: "uppercase",
                textDecoration: "none",
                "&:hover": { bgcolor: tokens.greenDark },
              }}
            >
              <CallIcon fontSize="small" /> Call
            </Box>
          )}
        </TableCell>
      </TableRow>
    ));

  return (
    <Box sx={{ bgcolor: "background.paper", overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Stage</TableCell>
            <TableCell>Next</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {grouped
            ? STAGES.flatMap((st) => {
                const g = leads.filter((l) => l.stage === st);
                if (!g.length) return [];
                return [
                  <TableRow key={"hd-" + st}>
                    <TableCell colSpan={4} sx={{ bgcolor: "#eef1f3", fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", height: 34 }}>
                      {st} ({g.length})
                    </TableCell>
                  </TableRow>,
                  ...rows(g),
                ];
              })
            : rows(leads)}
        </TableBody>
      </Table>
    </Box>
  );
}

function MobileLeadsList({
  leads,
  filter,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  filter: "All" | Stage;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  const grouped = filter === "All";

  const card = (l: LeadRow) => (
    <Box
      key={l.id}
      sx={{
        borderBottom: `8px solid ${tokens.bg}`,
        bgcolor: l.due && !DEAD_STAGES.includes(l.stage) ? tokens.amberTint : "background.paper",
        p: "12px 16px",
      }}
    >
      <Box onClick={() => onOpen(l.id)} sx={{ fontWeight: 500, fontSize: 15, color: tokens.primaryDark, cursor: "pointer" }}>
        {l.name}
        {l.stage === "New Lead" && <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: tokens.green, ml: 0.75 }}>NEW</Box>}
      </Box>
      <Typography sx={{ color: "text.secondary", fontSize: 13 }}>{l.phone}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.75 }}>
        <StageMenu current={l.stage} onPick={(s) => onStagePick(l.id, s)}>
          {(open) => (
            <Box
              component="button"
              onClick={open}
              sx={{ border: 0, bgcolor: "transparent", fontSize: 14, color: DEAD_STAGES.includes(l.stage) ? "text.disabled" : "text.primary", p: 0, cursor: "pointer" }}
            >
              {l.stage}
            </Box>
          )}
        </StageMenu>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13, color: l.reminder_at ? "#e65100" : "text.secondary" }}>
          {l.reminder_at && <AccessTimeIcon sx={{ fontSize: 14 }} />}
          {l.next_label}
        </Box>
      </Box>
      {!DEAD_STAGES.includes(l.stage) && (
        <Box
          component="a"
          href={`tel:${l.phone.replace(/\s/g, "")}`}
          onClick={() => setTimeout(() => onCall(l.id), 150)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            bgcolor: tokens.green,
            color: "#fff",
            borderRadius: "4px",
            p: "13px",
            fontWeight: 500,
            fontSize: 13,
            textTransform: "uppercase",
            textDecoration: "none",
            mt: 1.25,
            "&:hover": { bgcolor: tokens.greenDark },
          }}
        >
          <CallIcon fontSize="small" /> Call
        </Box>
      )}
    </Box>
  );

  return (
    <Box>
      {grouped
        ? STAGES.flatMap((st) => {
            const g = leads.filter((l) => l.stage === st);
            if (!g.length) return [];
            return [
              <Box
                key={"hd-" + st}
                sx={{ bgcolor: "#eef1f3", fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", p: "8px 16px", borderBottom: `1px solid ${tokens.divider}` }}
              >
                {st} ({g.length})
              </Box>,
              ...g.map(card),
            ];
          })
        : leads.map(card)}
    </Box>
  );
}
