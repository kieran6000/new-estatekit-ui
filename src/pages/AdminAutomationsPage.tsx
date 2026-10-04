import { useState } from "react";
import { AppBar, Box, CircularProgress, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import { tokens } from "../theme";
import { useIsOperator } from "../hooks/useAutomations";
import ScheduledAutomations from "../components/ScheduledAutomations";
import WorkflowBuilder from "../components/WorkflowBuilder";

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

function AutomationsAdmin() {
  const [tab, setTab] = useState<"scheduled" | "workflows">("workflows");

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
        <Tab label="Workflows" value="workflows" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
        <Tab label="Scheduled" value="scheduled" sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }} />
      </Tabs>
      {tab === "workflows" ? <WorkflowBuilder /> : <ScheduledAutomations />}
    </Box>
  );
}
