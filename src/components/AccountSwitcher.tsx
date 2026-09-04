import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, MenuItem, Select, Typography } from "@mui/material";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import { listAgentProfiles, setActiveAgent } from "../api/_client";
import { useAuth } from "../hooks/useAuth";

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

  const activeProfile = profiles.find((p) => p.agent_id === active);

  return (
    <Box sx={{ mb: 0.5 }}>
      <Select
        value={active}
        onChange={(e) => handleChange(e.target.value)}
        size="small"
        fullWidth
        IconComponent={UnfoldMoreIcon}
        renderValue={() => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: "6px",
                bgcolor: "#374151",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {(activeProfile ? label(activeProfile) : "?")[0].toUpperCase()}
            </Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeProfile ? label(activeProfile) : "Select account"}
            </Typography>
          </Box>
        )}
        sx={{
          bgcolor: "#1f2937",
          color: "#fff",
          fontSize: 13,
          borderRadius: "6px",
          "& .MuiSelect-icon": { color: "#6b7280", fontSize: 20 },
          "& .MuiOutlinedInput-notchedOutline": { border: "1px solid #374151" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#4b5563" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#2563eb" },
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
