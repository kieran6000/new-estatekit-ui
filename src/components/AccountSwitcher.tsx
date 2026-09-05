import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Box,
  Divider,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import { listAgentProfiles, setActiveAgent, getActiveAgentIdSync } from "../api/_client";
import { useAuth } from "../hooks/useAuth";

export default function AccountSwitcher({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [active, setActive] = useState(getActiveAgentIdSync() || user?.id || "");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState("");

  const { data: profiles = [] } = useQuery({
    queryKey: ["agentProfiles"],
    queryFn: listAgentProfiles,
  });

  function handleSelect(agentId: string) {
    setActive(agentId);
    setActiveAgent(agentId === user?.id ? null : agentId);
    qc.invalidateQueries();
    setAnchor(null);
    setSearch("");
  }

  if (profiles.length < 2) return null;

  const name = (p: { display_name: string | null; whatsapp_number: string | null; agent_id: string }) =>
    p.display_name || p.whatsapp_number || p.agent_id.slice(0, 8);

  const activeProfile = profiles.find((p) => p.agent_id === active);
  const activeName = activeProfile ? name(activeProfile) : "Select account";
  const activeInitial = activeName[0].toUpperCase();
  const activeArea = activeProfile?.area || activeProfile?.company || "";
  const activePfp = activeProfile?.sidebar_logo_url || null;

  const filtered = search
    ? profiles.filter((p) => name(p).toLowerCase().includes(search.toLowerCase()))
    : profiles;

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        component="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: "100%",
          p: "8px 10px",
          bgcolor: variant === "dark" ? "#ffffff15" : "#ffffff15",
          border: variant === "dark" ? "1px solid #fcfdff45" : "1px solid #d1d5db",
          borderRadius: "6px",
          cursor: "pointer",
          textAlign: "left",
          "&:hover": { borderColor: variant === "dark" ? "#fcfdff8e" : "#fcfdff8e" },
        }}
      >
        <Avatar src={activePfp ?? undefined} sx={{ width: 30, height: 30, bgcolor: "#6366f1", fontSize: 13, fontWeight: 700 }}>
          {activeInitial}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: variant === "dark" ? "#fff" : "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeName}
          </Typography>
          {activeArea && (
            <Typography sx={{ fontSize: 11, color: variant === "dark" ? "rgba(255,255,255,.6)" : "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeArea}
            </Typography>
          )}
        </Box>
        <UnfoldMoreIcon sx={{ color: "#6b7280", fontSize: 18 }} />
      </Box>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => { setAnchor(null); setSearch(""); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 280, mt: 0.5, borderRadius: "8px" } } }}
      >
        <Box sx={{ p: 1.5 }}>
          <TextField
            placeholder="Search for a sub-account"
            size="small"
            fullWidth
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>
        <Divider />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", px: 2, pt: 1.25, pb: 0.5 }}>
          All accounts
        </Typography>
        <List disablePadding sx={{ maxHeight: 300, overflowY: "auto", pb: 1 }}>
          {filtered.map((p) => {
            const pName = name(p);
            const isActive = p.agent_id === active;
            return (
              <ListItemButton
                key={p.agent_id}
                selected={isActive}
                onClick={() => handleSelect(p.agent_id)}
                sx={{ py: 1, px: 2 }}
              >
                <ListItemAvatar sx={{ minWidth: 44 }}>
                  <Avatar src={p.sidebar_logo_url ?? undefined} sx={{ width: 34, height: 34, bgcolor: isActive ? "#6366f1" : "#e0e0e0", color: isActive ? "#fff" : "#666", fontSize: 14, fontWeight: 700 }}>
                    {pName[0].toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={pName}
                  secondary={[p.agent_id === user?.id ? "You" : null, p.area || p.company].filter(Boolean).join(" · ") || null}
                  slotProps={{
                    primary: { sx: { fontSize: 14, fontWeight: 500 } },
                    secondary: { sx: { fontSize: 12 } },
                  }}
                />
              </ListItemButton>
            );
          })}
          {filtered.length === 0 && (
            <Typography sx={{ px: 2, py: 1.5, fontSize: 13, color: "text.disabled" }}>
              No accounts found
            </Typography>
          )}
        </List>
      </Popover>
    </Box>
  );
}
