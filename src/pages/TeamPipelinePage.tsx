import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { setActiveAgent } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import { useIsOperator } from "../hooks/useAutomations";
import { useTeamPipelines } from "../hooks/usePipelines";

/** /team-pipeline/<id>: opens a pipeline shared with the team on the Leads
 *  tab. Staff are switched into the account it belongs to (so every action on
 *  its leads works as usual), with that pipeline picked. */
export default function TeamPipelinePage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { data: isOperator } = useIsOperator();
  const { data: team, isLoading } = useTeamPipelines(isOperator === true);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = team?.find((t) => t.id === id);

  useEffect(() => {
    if (!p || !user) return;
    const mine = p.agent_id === user.id;
    setActiveAgent(mine ? null : p.agent_id);
    try { localStorage.setItem(`estatekit_last_pipeline_${mine ? "me" : p.agent_id}`, p.id); } catch { /* private browsing */ }
    void qc.invalidateQueries();
    navigate("/leads", { replace: true });
  }, [p, user, qc, navigate]);

  if (isOperator === false) return <Navigate to="/leads" replace />;
  if (isLoading || isOperator === undefined || p) {
    return <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}><CircularProgress /></Box>;
  }
  return (
    <Box sx={{ p: 4 }}>
      <Typography sx={{ fontWeight: 500 }}>This pipeline isn't shared with the team any more.</Typography>
      <Button onClick={() => navigate("/clients")} sx={{ mt: 1 }}>Back to Accounts</Button>
    </Box>
  );
}
