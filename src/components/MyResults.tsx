import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, ButtonBase, Collapse, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import { tokens } from "../theme";
import { supabase, getActiveAgentIdSync } from "../api/_client";
import InfoTip from "./InfoTip";

interface Results {
  days: number;
  leads: number;
  followed_up: number;
  booked: number;
  mandates: number;
  waiting: number;
  no_answer: number;
}

async function getResults(agentId: string, days: number): Promise<Results | null> {
  const { data, error } = await supabase.rpc("get_agent_results", { p_agent: agentId, p_days: days });
  if (error) throw new Error(error.message);
  return (data as Results) ?? null;
}

const KEY = "estatekit_my_results_open";

/** "My results": the agent's own numbers, the same ones EstateKit looks at on
 *  check-ins (get_agent_results). One line under the Leads title; tap it for
 *  the detail. Plain words, no percentages. */
export default function MyResults() {
  const agentId = getActiveAgentIdSync();
  const [days, setDays] = useState<7 | 30>(7);
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  const { data: r } = useQuery({
    queryKey: ["agentResults", agentId, days],
    queryFn: () => getResults(agentId!, days),
    enabled: !!agentId,
    staleTime: 60_000,
  });
  if (!r) return null;

  function toggle() {
    setOpen((v) => {
      try { localStorage.setItem(KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  }

  const period = days === 7 ? "This week" : "Last 30 days";
  const tiles: [string, number, string?][] = [
    ["New leads", r.leads],
    ["You followed up", r.followed_up],
    ["Booked", r.booked],
    ["Mandates", r.mandates],
  ];

  return (
    <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
      <ButtonBase
        onClick={toggle}
        aria-expanded={open}
        sx={{ width: "100%", justifyContent: "flex-start", gap: 1, px: 2, py: 1.25, textAlign: "left", minHeight: 48 }}
      >
        <InsightsOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />
        <Typography sx={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
          <b>{period}:</b> {r.leads} new {r.leads === 1 ? "lead" : "leads"}, you followed up {r.followed_up}
          {r.waiting > 0 && (
            <Box component="span" sx={{ color: "warning.dark", fontWeight: 600 }}>
              {" "}· {r.waiting} waiting for a call
            </Box>
          )}
        </Typography>
        <ExpandMoreIcon sx={{ color: "text.secondary", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </ButtonBase>

      <Collapse in={open}>
        <Box sx={{ px: 2, pb: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <ToggleButtonGroup size="small" exclusive value={days} onChange={(_e, v) => v && setDays(v)}>
              <ToggleButton value={7} sx={{ textTransform: "none", px: 1.75 }}>This week</ToggleButton>
              <ToggleButton value={30} sx={{ textTransform: "none", px: 1.75 }}>30 days</ToggleButton>
            </ToggleButtonGroup>
            <InfoTip>
              "You followed up" counts leads you called or moved to another stage. "Waiting for a call" and "No answer" are how many are there
              right now. These are the same numbers EstateKit looks at on your check-ins.
            </InfoTip>
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 1 }}>
            {tiles.map(([label, n]) => (
              <Box key={label} sx={{ border: `1px solid ${tokens.divider2}`, borderRadius: "6px", px: 1.5, py: 1 }}>
                <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{n}</Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{label}</Typography>
              </Box>
            ))}
          </Box>

          {(r.waiting > 0 || r.no_answer > 0) && (
            <Box sx={{ bgcolor: tokens.amberTint, borderRadius: "6px", px: 1.5, py: 1.25 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>To do now</Typography>
              {r.waiting > 0 && (
                <Typography sx={{ fontSize: 14 }}>
                  {r.waiting} {r.waiting === 1 ? "lead is" : "leads are"} waiting for a first call (New Lead).
                </Typography>
              )}
              {r.no_answer > 0 && (
                <Typography sx={{ fontSize: 14 }}>
                  {r.no_answer} {r.no_answer === 1 ? "lead" : "leads"} didn't answer. Try again (No Answer).
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
