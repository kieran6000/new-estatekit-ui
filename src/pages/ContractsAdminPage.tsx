import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppBar, Box, IconButton, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { tokens } from "../theme";
import { listReportAgents } from "../api/weeklyReportSends";
import ContractsSection, { type ContractClient } from "../components/ContractsSection";

// Every contract, for the team. Each client's own are on their Contract tab.

type View = "all" | "waiting" | "signed";

export default function ContractsAdminPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("waiting");
  const { data: agents } = useQuery({ queryKey: ["reportAgents"], queryFn: listReportAgents, staleTime: 5 * 60_000 });
  const clients = useMemo<ContractClient[]>(
    () => (agents ?? []).map((a) => ({ agentId: a.agent_id, name: a.display_name ?? "", phone: a.whatsapp_number })).filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/clients")} aria-label="Back to accounts"><ArrowBackIcon /></IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Contracts</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <Tabs value={view} onChange={(_e, v) => setView(v)}>
            <Tab value="waiting" label="Waiting" />
            <Tab value="signed" label="Signed" />
            <Tab value="all" label="All" />
          </Tabs>
        </Box>
      </Box>
      <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
        <ContractsSection
          clients={clients}
          only={view === "all" ? undefined : view === "signed" ? (c) => !!c.signed_at : (c) => !c.signed_at && !c.voided_at}
        />
      </Box>
    </Box>
  );
}
