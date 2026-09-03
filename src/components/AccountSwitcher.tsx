import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, MenuItem, Select, Typography } from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { listAgentProfiles, setActiveAgent } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import { tokens } from "../theme";

export default function AccountSwitcher() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [active, setActive] = useState(user?.id ?? "");

  const { data: profiles = [] } = useQuery({
    queryKey: ["agentProfiles"],
    queryFn: listAgentProfiles,
  });

  function handleChange(agentId: string) {
    setActive(agentId);
    setActiveAgent(agentId === user?.id ? null : agentId);
    qc.invalidateQueries();
  }

  if (profiles.length < 2) return null;

  const label = (p: { agent_id: string; display_name: string | null; whatsapp_number: string | null }) =>
    p.display_name || p.whatsapp_number || p.agent_id.slice(0, 8);

  return (
    <Box sx={{ px: 1, pb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        <SwapHorizIcon sx={{ fontSize: 14, color: tokens.railInk }} />
        <Typography sx={{ fontSize: 10, fontWeight: 600, color: tokens.railInk, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Viewing as
        </Typography>
      </Box>
      <Select
        value={active}
        onChange={(e) => handleChange(e.target.value)}
        size="small"
        fullWidth
        sx={{
          bgcolor: tokens.railActive,
          color: "#fff",
          fontSize: 13,
          borderRadius: "6px",
          "& .MuiSelect-icon": { color: "#fff" },
          "& .MuiOutlinedInput-notchedOutline": { border: 0 },
        }}
      >
        {profiles.map((p) => (
          <MenuItem key={p.agent_id} value={p.agent_id} sx={{ fontSize: 13 }}>
            {label(p)}
            {p.agent_id === user?.id ? " (you)" : ""}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}
