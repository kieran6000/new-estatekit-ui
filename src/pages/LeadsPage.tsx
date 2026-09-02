import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  FormControlLabel,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import NotificationsIcon from "@mui/icons-material/Notifications";
import CallIcon from "@mui/icons-material/Call";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { tokens } from "../theme";
import { DEAD_STAGES, PIPELINE_KIND_LABEL, PIPELINE_STAGES, type LeadRow, type OutcomeStep, type Pipeline, type PipelineKind, type Stage } from "../types";
import { dueLeads, pipelineKindFor, sortLeadsForList, STEP_FOR_STAGE } from "../lib/stageLogic";
import { useLeads, useUpdateLeadStage } from "../hooks/useLeads";
import { useAddPipeline, usePipelines } from "../hooks/usePipelines";
import { useSnack } from "../hooks/useSnack";
import StageMenu from "../components/StageMenu";
import OutcomeSheet from "../components/OutcomeSheet";
import FocusCallModal from "../components/FocusCallModal";

export default function LeadsPage() {
  const navigate = useNavigate();
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const updateStage = useUpdateLeadStage();
  const showSnack = useSnack();

  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [pipelineMenuAnchor, setPipelineMenuAnchor] = useState<HTMLElement | null>(null);
  const [addPipelineOpen, setAddPipelineOpen] = useState(false);
  const [filter, setFilter] = useState<"All" | Stage>("All");
  const [outcomeLeadId, setOutcomeLeadId] = useState<string | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [stageSheet, setStageSheet] = useState<{ leadId: string; step: OutcomeStep; stage: Stage } | null>(null);

  const activePipeline: Pipeline | undefined = pipelines.find((p) => p.id === pipelineId) ?? pipelines.find((p) => p.kind === "seller") ?? pipelines[0];
  const stagesForPipeline = activePipeline ? PIPELINE_STAGES[activePipeline.kind] : [];

  const pipelineLeads = useMemo(
    () => (activePipeline ? leads.filter((l) => l.pipeline_id === activePipeline.id) : []),
    [leads, activePipeline],
  );

  const due = useMemo(() => dueLeads(pipelineLeads), [pipelineLeads]);
  const remCount = due.filter((l) => l.reminder_at).length;
  const freshCount = due.length - remCount;

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return sortLeadsForList(pipelineLeads).filter((l) => {
      if (filter !== "All" && l.stage !== filter) return false;
      if (!query) return true;
      return l.name.toLowerCase().includes(query) || l.phone.replace(/\s/g, "").includes(query.replace(/\s/g, ""));
    });
  }, [pipelineLeads, filter, q]);

  const outcomeLead = leads.find((l) => l.id === outcomeLeadId);
  const stageSheetLead = leads.find((l) => l.id === stageSheet?.leadId);
  const outcomeLeadKind = outcomeLead ? pipelineKindFor(outcomeLead, pipelines) : "seller";
  const stageSheetLeadKind = stageSheetLead ? pipelineKindFor(stageSheetLead, pipelines) : "seller";

  function handleStagePick(id: string, stage: Stage) {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const step = STEP_FOR_STAGE[stage];
    if (step) {
      setStageSheet({ leadId: id, step, stage });
      return;
    }
    const prev = { stage: lead.stage, next_label: lead.next_label, due: lead.due, reminder_at: lead.reminder_at, commission: lead.commission };
    updateStage.mutate({ id, stage });
    showSnack(`${lead.name.split(" ")[0]} moved to ${stage}`, () =>
      updateStage.mutate({ id, stage: prev.stage, override: prev }),
    );
  }

  function selectPipeline(id: string) {
    setPipelineId(id);
    setFilter("All");
    setPipelineMenuAnchor(null);
  }

  if (leadsLoading || pipelinesLoading) return <LeadsPageSkeleton />;
  if (!activePipeline) return null;

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


      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 1, gap: 1.75, p: "14px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <NotificationsIcon sx={{ color: due.length ? tokens.primary : tokens.green }} />
        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Typography sx={{ fontWeight: 500, fontSize: 15 }}>
            {due.length === 0 ? "You're all caught up" : `${due.length} to call today`}
          </Typography>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
            {due.length === 0
              ? "No one to call today."
              : [freshCount && `${freshCount} new`, remCount && `${remCount} follow-up${remCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: "auto" }}>
          <Box
            component="button"
            onClick={() => navigate("/overview")}
            sx={{ border: 0, bgcolor: "transparent", color: "text.secondary", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", "&:hover": { color: tokens.primary } }}
          >
            Full numbers ›
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
                whiteSpace: "nowrap",
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
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: "8px 16px", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box
          component="button"
          onClick={(e) => setPipelineMenuAnchor(e.currentTarget)}
          sx={{ display: "flex", alignItems: "center", gap: 0.25, border: `1px solid ${tokens.divider}`, borderRadius: "4px", bgcolor: "#fff", fontSize: 13, fontWeight: 500, p: "7px 6px 7px 12px", cursor: "pointer" }}
        >
          {activePipeline.name} pipeline <ArrowDropDownIcon fontSize="small" />
        </Box>
        <PipelineMenu
          anchor={pipelineMenuAnchor}
          pipelines={pipelines}
          onClose={() => setPipelineMenuAnchor(null)}
          onSelect={selectPipeline}
          onAddNew={() => {
            setPipelineMenuAnchor(null);
            setAddPipelineOpen(true);
          }}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1, p: "10px 16px", overflowX: "auto", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        {(["All", ...stagesForPipeline] as const).map((s) => (
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
        stages={stagesForPipeline}
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
        pipelineKind={outcomeLeadKind}
        open={!!outcomeLeadId}
        onClose={() => setOutcomeLeadId(null)}
        onSnack={showSnack}
      />
      <OutcomeSheet
        lead={stageSheetLead}
        pipelineKind={stageSheetLeadKind}
        open={!!stageSheet}
        entryStep={stageSheet?.step ?? "main"}
        entryStage={stageSheet?.stage}
        onClose={() => setStageSheet(null)}
        onSnack={showSnack}
      />
      <FocusCallModal leads={pipelineLeads} pipelines={pipelines} open={focusOpen} onClose={() => setFocusOpen(false)} onSnack={showSnack} />
      <AddPipelineDialog
        open={addPipelineOpen}
        onClose={() => setAddPipelineOpen(false)}
        onCreated={(id) => {
          selectPipeline(id);
          showSnack("Pipeline created");
        }}
      />
    </Box>
  );
}

function LeadsPageSkeleton() {
  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", px: "8px 8px 8px 16px" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Leads</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Skeleton variant="rounded" height={64} sx={{ borderRadius: "6px" }} />
        <Skeleton variant="rounded" height={40} width={180} sx={{ borderRadius: "4px" }} />
        <Skeleton variant="rounded" height={72} sx={{ borderRadius: "6px" }} />
        <Skeleton variant="rounded" height={72} sx={{ borderRadius: "6px" }} />
      </Box>
    </Box>
  );
}

function EmptyLeadsState({ filter }: { filter: "All" | Stage }) {
  return (
    <Box sx={{ p: "48px 24px", textAlign: "center", color: "text.secondary" }}>
      <Typography sx={{ fontSize: 15, fontWeight: 500, mb: 0.5 }}>
        {filter === "All" ? "No leads yet in this pipeline" : `No leads in "${filter}"`}
      </Typography>
      <Typography sx={{ fontSize: 13.5 }}>
        {filter === "All" ? "New leads from your lead pages will show up here." : "Try a different stage, or switch back to All."}
      </Typography>
    </Box>
  );
}

function PipelineMenu({
  anchor,
  pipelines,
  onClose,
  onSelect,
  onAddNew,
}: {
  anchor: HTMLElement | null;
  pipelines: Pipeline[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}) {
  return (
    <Menu anchorEl={anchor} open={!!anchor} onClose={onClose}>
      {pipelines.map((p) => (
        <MenuItem key={p.id} onClick={() => onSelect(p.id)}>
          {p.name}
        </MenuItem>
      ))}
      <MenuItem onClick={onAddNew} sx={{ color: tokens.primary, borderTop: `1px solid ${tokens.divider2}`, mt: 0.5 }}>
        + Add pipeline
      </MenuItem>
    </Menu>
  );
}

function AddPipelineDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<PipelineKind>("seller");
  const [name, setName] = useState("");
  const addPipeline = useAddPipeline();

  async function create() {
    const finalName = name.trim() || PIPELINE_KIND_LABEL[kind].replace("-style", "");
    const p = await addPipeline.mutateAsync({ name: finalName, kind });
    setName("");
    onClose();
    onCreated(p.id);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 18, fontWeight: 500 }}>Add pipeline</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <RadioGroup value={kind} onChange={(e) => setKind(e.target.value as PipelineKind)}>
          <FormControlLabel value="seller" control={<Radio />} label="Seller-style (New Lead → Mandate Signed)" />
          <FormControlLabel value="buyer" control={<Radio />} label="Buyer-style (New Lead → Bought)" />
        </RadioGroup>
        <TextField label="Pipeline name" placeholder={PIPELINE_KIND_LABEL[kind].replace("-style", "")} value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={create}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LeadsTable({
  leads,
  stages,
  filter,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  stages: Stage[];
  filter: "All" | Stage;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  const isMobile = useMediaQuery("(max-width:639px)");
  if (isMobile) {
    return <MobileLeadsList leads={leads} stages={stages} filter={filter} onOpen={onOpen} onCall={onCall} onStagePick={onStagePick} />;
  }

  if (leads.length === 0) {
    return <EmptyLeadsState filter={filter} />;
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
          <StageMenu current={l.stage} stages={stages} onPick={(s) => onStagePick(l.id, s)}>
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
            ? stages.flatMap((st) => {
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
  stages,
  filter,
  onOpen,
  onCall,
  onStagePick,
}: {
  leads: LeadRow[];
  stages: Stage[];
  filter: "All" | Stage;
  onOpen: (id: string) => void;
  onCall: (id: string) => void;
  onStagePick: (id: string, stage: Stage) => void;
}) {
  if (leads.length === 0) {
    return <EmptyLeadsState filter={filter} />;
  }

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
        <StageMenu current={l.stage} stages={stages} onPick={(s) => onStagePick(l.id, s)}>
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
        ? stages.flatMap((st) => {
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
