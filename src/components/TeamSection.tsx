import { useState } from "react";
import { Autocomplete, Avatar, Box, Chip, Divider, FormControlLabel, Checkbox, TextField, Typography } from "@mui/material";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import CheckIcon from "@mui/icons-material/Check";
import { useQuery } from "@tanstack/react-query";
import { listAgentProfiles } from "../api/_client";
import { tokens } from "../theme";

// Teams: a team lead (e.g. Bennie) gets the account switcher and can work
// inside their members' accounts (e.g. Naudé), the way operators can today.
//
// UI ONLY FOR NOW: nothing here saves. Backend plan (add-only):
//   - agent_profiles.team_lead_id uuid null references agent_profiles(agent_id)
//   - can_manage(agent) = is_operator() or agent = auth.uid()
//       or exists (member with team_lead_id = auth.uid())
//   - RLS on leads, lead_pages, pipelines, agent_profiles, sold_listings:
//     swap "agent_id = auth.uid() or is_operator()" for can_manage(agent_id)
//   - AppShell shows <AccountSwitcher /> when isOperator OR the user leads a team;
//     the switcher already lists whatever profiles RLS lets you read.
// Team leads never see billing, contract or other clients.

// Known teams, until this is stored: Bennie Bell leads Naudé Kritzinger.
const BENNIE = "d5bd1eea-d3d5-4daa-9e15-ab3c621192eb";
const NAUDE = "0eba9b17-2e1a-4bc9-91bc-096e33cf39e1";
const KNOWN_TEAMS: Record<string, string> = { [NAUDE]: BENNIE };

type Profile = Awaited<ReturnType<typeof listAgentProfiles>>[number];

const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const PERMISSIONS = [
  { k: "leads", label: "See and update their leads", on: true },
  { k: "pages", label: "Edit their lead pages and forms", on: true },
  { k: "results", label: "See their results and weekly report", on: true },
  { k: "settings", label: "Change their WhatsApp number and profile", on: false },
] as const;

export default function TeamSection({ agentId, name }: { agentId: string; name: string }) {
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });
  const others = profiles.filter((p) => p.agent_id !== agentId);
  const [leadId, setLeadId] = useState<string | null>(KNOWN_TEAMS[agentId] ?? null);
  const [memberIds, setMemberIds] = useState<string[]>(() => Object.entries(KNOWN_TEAMS).filter(([, l]) => l === agentId).map(([m]) => m));
  const [perms, setPerms] = useState<Record<string, boolean>>(() => Object.fromEntries(PERMISSIONS.map((p) => [p.k, p.on])));

  const byId = (id: string | null) => profiles.find((p) => p.agent_id === id);
  const lead = byId(leadId);
  const members = memberIds.map(byId).filter(Boolean) as Profile[];
  const first = name.split(/\s+/)[0] || "They";

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "center", gap: 1, minHeight: 44 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>Team</Typography>
        <Chip size="small" label="Preview · not saved" color="warning" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
      </Box>
      <Box sx={{ px: 2, pb: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <Autocomplete
          size="small"
          options={others}
          value={lead ?? null}
          onChange={(_, v) => { setLeadId(v?.agent_id ?? null); if (v) setMemberIds([]); }}
          getOptionLabel={(p) => p.display_name ?? "Unnamed"}
          isOptionEqualToValue={(a, b) => a.agent_id === b.agent_id}
          renderInput={(p) => <TextField {...p} label={`${first} is in the team of`} placeholder="No team lead" helperText={lead ? `${lead.display_name} can switch into ${first}'s account.` : "Leave empty if they work on their own or lead a team."} />}
        />

        {!lead && (
          <>
            <Divider />
            <Autocomplete
              multiple
              size="small"
              options={others.filter((p) => KNOWN_TEAMS[p.agent_id] === undefined || KNOWN_TEAMS[p.agent_id] === agentId)}
              value={members}
              onChange={(_, v) => setMemberIds(v.map((p) => p.agent_id))}
              getOptionLabel={(p) => p.display_name ?? "Unnamed"}
              isOptionEqualToValue={(a, b) => a.agent_id === b.agent_id}
              renderInput={(p) => <TextField {...p} label={`${first}'s team members`} placeholder={members.length ? "" : "Add an agent"} />}
            />
            {members.length > 0 && (
              <>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 0.5 }}>Inside a member's account, {first} can:</Typography>
                  {PERMISSIONS.map((p) => (
                    <FormControlLabel
                      key={p.k}
                      sx={{ display: "flex", ml: -0.5, "& .MuiFormControlLabel-label": { fontSize: 13.5 } }}
                      control={<Checkbox size="small" checked={perms[p.k]} onChange={(e) => setPerms({ ...perms, [p.k]: e.target.checked })} />}
                      label={p.label}
                    />
                  ))}
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>Billing, contracts and other clients always stay hidden.</Typography>
                </Box>
                <SwitcherPreview leadName={name} lead={byId(agentId)} members={members} />
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

/** What the team lead sees in their sidebar: the same switcher operators
 *  have, listing only themselves and their team. */
function SwitcherPreview({ leadName, lead, members }: { leadName: string; lead: Profile | undefined; members: Profile[] }) {
  const rows = [{ id: "me", name: leadName, sub: "You", avatar: lead?.avatar_url }, ...members.map((m) => ({ id: m.agent_id, name: m.display_name ?? "Unnamed", sub: m.company ?? "", avatar: m.avatar_url }))];
  return (
    <Box>
      <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mb: 1 }}>What {leadName.split(/\s+/)[0]} will see</Typography>
      <Box sx={{ bgcolor: tokens.railBg, borderRadius: "8px", p: 1.25, maxWidth: 280 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: tokens.railHover, borderRadius: "6px", px: 1, py: 0.75, color: "#fff" }}>
          <Avatar src={lead?.avatar_url ?? undefined} sx={{ width: 26, height: 26, fontSize: 11 }}>{initials(leadName)}</Avatar>
          <Typography sx={{ fontSize: 13.5, flex: 1, minWidth: 0 }} noWrap>{leadName}</Typography>
          <UnfoldMoreIcon sx={{ fontSize: 18, color: tokens.railInk }} />
        </Box>
        <Box sx={{ mt: 1, bgcolor: "background.paper", borderRadius: "6px", py: 0.5, boxShadow: `0 4px 14px ${tokens.shadow}` }}>
          {rows.map((r, i) => (
            <Box key={r.id} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.25, py: 0.75, bgcolor: i === 0 ? tokens.primaryBg : "transparent" }}>
              <Avatar src={r.avatar ?? undefined} sx={{ width: 26, height: 26, fontSize: 11 }}>{initials(r.name)}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5 }} noWrap>{r.name}</Typography>
                {r.sub && <Typography sx={{ fontSize: 11.5, color: "text.secondary" }} noWrap>{r.sub}</Typography>}
              </Box>
              {i === 0 && <CheckIcon sx={{ fontSize: 16, color: "primary.main" }} />}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
