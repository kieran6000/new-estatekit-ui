import { Navigate, Route, Routes } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useIsOperator } from "../hooks/useAutomations";
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

// One page: the account's workflows, each with its own switch, and what's
// waiting in each (see WorkflowBuilder). The Scheduled and Templates tabs
// were folded in / dropped (Oct 2026): templates only seed new accounts.
//   /admin/automations/workflows        the list
//   /admin/automations/workflows/<id>   a workflow's editor (full screen)
// Old /scheduled and /templates links land on the list.
function AutomationsAdmin() {
  return (
    <Routes>
      <Route path="workflows" element={<WorkflowListPage scope="account" />} />
      <Route path="workflows/:id" element={<WorkflowEditorPage scope="account" />} />
      <Route path="*" element={<Navigate to="/admin/automations/workflows" replace />} />
    </Routes>
  );
}
