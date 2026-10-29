import { Navigate, Route, Routes, useMatch } from "react-router-dom";
import { Box, CircularProgress, Typography, useMediaQuery } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import { tokens } from "../theme";
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

// Like a mail app: the sidebar (Automations / Coming up, search, sort, a
// switch per automation) on the left, the open automation on the right. On
// a phone the sidebar is the whole screen and an automation opens over it.
// The Scheduled and Templates tabs went (Oct 2026): "Coming up" replaced
// Scheduled; templates only seed new accounts.
//   /admin/automations/workflows        the sidebar (+ "pick one" on a computer)
//   /admin/automations/workflows/<id>   an automation open
// Old /scheduled and /templates links land on the list.
function AutomationsAdmin() {
  const wide = useMediaQuery("(min-width:900px)");
  const open = useMatch("/admin/automations/workflows/:id");
  const selectedId = open?.params.id;

  if (!wide) {
    return (
      <Routes>
        <Route path="workflows" element={<Box sx={{ height: "calc(100dvh - var(--ek-nav-h, 0px))" }}><WorkflowListPage scope="account" /></Box>} />
        <Route path="workflows/:id" element={<WorkflowEditorPage scope="account" />} />
        <Route path="*" element={<Navigate to="/admin/automations/workflows" replace />} />
      </Routes>
    );
  }
  return (
    <Box sx={{ display: "flex", height: "calc(100dvh - var(--ek-nav-h, 0px))" }}>
      <Box sx={{ width: 380, flex: "none", borderRight: `1px solid ${tokens.divider}`, minHeight: 0 }}>
        <WorkflowListPage scope="account" selectedId={selectedId} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <Routes>
          <Route path="workflows" element={<PickOne />} />
          <Route path="workflows/:id" element={<WorkflowEditorPage scope="account" embedded />} />
          <Route path="*" element={<Navigate to="/admin/automations/workflows" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}

function PickOne() {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "text.secondary", px: 4 }}>
      <BoltIcon sx={{ fontSize: 44, color: "text.disabled", mb: 1 }} />
      <Typography sx={{ fontSize: 16, fontWeight: 500, color: "text.primary" }}>Pick an automation</Typography>
      <Typography sx={{ fontSize: 14, mt: 0.5, maxWidth: 360 }}>Choose one on the left to see what it sends and change it. Use the switches to turn them on or off.</Typography>
    </Box>
  );
}
