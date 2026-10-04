import { Link as RouterLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppBar, Box, CircularProgress, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import { tokens } from "../theme";
import { useIsOperator } from "../hooks/useAutomations";
import ScheduledAutomations from "../components/ScheduledAutomations";
import { WorkflowEditorPage, WorkflowListPage } from "../components/WorkflowBuilder";

// Every account runs on its own workflows (Oct 2026). The old shared
// "Setup" automations were retired: each account got a copy of them as
// standard workflows, and the Workflows tab is where they're changed.

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

// Three sections, each its own address (see WorkflowBuilder for the
// workflow ones), so a refresh, Back and a shared link all land in the same
// place:
//   /admin/automations/workflows   this account's workflows (+ /<id>)
//   /admin/automations/scheduled   what's about to happen, every workflow
//   /admin/automations/templates   the shared library (+ /<id>)
// Opening a workflow or template is a full-screen editor with its own back
// button, so the section tabs only show on the lists.
const SECTIONS = [
  { key: "workflows", label: "Workflows" },
  { key: "scheduled", label: "Scheduled" },
  { key: "templates", label: "Templates" },
] as const;

function AutomationsAdmin() {
  const { pathname } = useLocation();
  const parts = pathname.replace(/\/+$/, "").split("/").slice(3); // after /admin/automations
  const section = SECTIONS.find((s) => s.key === parts[0])?.key ?? "workflows";
  const inEditor = parts.length > 1 && section !== "scheduled";

  return (
    <Box>
      {!inEditor && (
        <>
          <AppBar position="sticky">
            <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
              <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Automations</Typography>
            </Toolbar>
          </AppBar>
          <Tabs value={section} sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, minHeight: 44, px: 1 }}>
            {SECTIONS.map((s) => (
              <Tab key={s.key} value={s.key} label={s.label} component={RouterLink} to={`/admin/automations/${s.key}`} sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
            ))}
          </Tabs>
        </>
      )}
      <Routes>
        <Route index element={<Navigate to="workflows" replace />} />
        <Route path="workflows" element={<WorkflowListPage scope="account" />} />
        <Route path="workflows/:id" element={<WorkflowEditorPage scope="account" />} />
        <Route path="templates" element={<WorkflowListPage key="templates" scope="templates" />} />
        <Route path="templates/:id" element={<WorkflowEditorPage scope="templates" />} />
        <Route path="scheduled" element={<ScheduledAutomations />} />
        <Route path="*" element={<Navigate to="workflows" replace />} />
      </Routes>
    </Box>
  );
}
