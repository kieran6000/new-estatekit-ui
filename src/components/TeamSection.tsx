import { useState } from "react";
import { Autocomplete, Avatar, Box, Divider, TextField, Typography } from "@mui/material";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import CheckIcon from "@mui/icons-material/Check";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listAgentProfiles } from "../api/_client";
import { setTeamLead } from "../api/clients";
import { useSnack } from "../hooks/useSnack";
import { tokens } from "../theme";

// Teams: a team lead (e.g. Bennie) gets the account switcher and can work
// inside their members' accounts (e.g. Naudé, Hendrik), the way staff can,
// but only theirs. Stored as agent_profiles.team_lead_id on each member; what
// a team lead may do there is set in the database (manages_agent() and the
// "Team leads …" policies, 20261027_0001_team_leads.sql). Saves on change.

type Profile = Awaited<ReturnType<typeof listAgentProfiles>>[number];

const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// What a team lead can do in a member's account (fixed: see the policies).
const CAN = ["See and update their leads, and log calls", "Edit their forms, lead pages and pipelines", "See their results and recent sales"];
const CANNOT = "Their profile and settings, billing, workflows and other agents always stay hidden.";

export default function TeamSection({ agentId, name }: { agentId: string; name: string }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [busy, setBusy] = useState(false);
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });
  const others = profiles.filter((p) => p.agent_id !== agentId);
  const byId = (id: string | null | undefined) => profiles.find((p) => p.agent_id === id);
  const me = byId(agentId);
  const lead = byId(me?.team_lead_id);
  const members = profiles.filter((p) => p.team_lead_id === agentId);
  const first = name.split(/\s+/)[0] || "They";

  async function save(changes: { member: string; lead: string | null }[], done: string) {
    if (!changes.length) return;
    setBusy(true);
    try {
      for (const c of changes) await setTeamLead(c.member, c.lead);
      showSnack(done);
    } catch {
      showSnack("Not saved. Try again.");
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["agentProfiles"] });
    }
  }

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "center", gap: 1, minHeight: 44 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>Team</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* A team lead isn't also in someone else's team. */}
        {members.length === 0 && (
          <Autocomplete
            size="small"
            disabled={busy}
            options={others.filter((p) => !p.team_lead_id)}
            value={lead ?? null}
            onChange={(_, v) => save([{ member: agentId, lead: v?.agent_id ?? null }], v ? `${first} is now in ${v.display_name}'s team` : `${first} is no longer in a team`)}
            getOptionLabel={(p) => p.display_name ?? "Unnamed"}
            isOptionEqualToValue={(a, b) => a.agent_id === b.agent_id}
            renderInput={(p) => <TextField {...p} label={`${first} is in the team of`} placeholder="No team lead" helperText={lead ? `${lead.display_name} can switch into ${first}'s account.` : "Leave empty if they work on their own or lead a team."} />}
          />
        )}

        {!lead && (
          <>
            {members.length === 0 && <Divider />}
            <Autocomplete
              multiple
              size="small"
              disabled={busy}
              options={others.filter((p) => (!p.team_lead_id || p.team_lead_id === agentId) && !profiles.some((x) => x.team_lead_id === p.agent_id))}
              value={members}
              onChange={(_, v) => {
                const ids = v.map((p) => p.agent_id);
                const added = ids.filter((id) => !members.some((m) => m.agent_id === id));
                const removed = members.filter((m) => !ids.includes(m.agent_id)).map((m) => m.agent_id);
                void save(
                  [...added.map((member) => ({ member, lead: agentId })), ...removed.map((member) => ({ member, lead: null }))],
                  added.length ? `${byId(added[0])?.display_name ?? "They"} added to ${first}'s team` : `Removed from ${first}'s team`,
                );
              }}
              getOptionLabel={(p) => p.display_name ?? "Unnamed"}
              isOptionEqualToValue={(a, b) => a.agent_id === b.agent_id}
              renderInput={(p) => <TextField {...p} label={`${first}'s team members`} placeholder={members.length ? "" : "Add an agent"} />}
            />
            {members.length > 0 && (
              <>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 0.5 }}>Inside a member's account, {first} can:</Typography>
                  {CAN.map((c) => (
                    <Box key={c} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13.5, py: 0.25 }}>
                      <CheckIcon sx={{ fontSize: 16, color: tokens.green }} />{c}
                    </Box>
                  ))}
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>{CANNOT}</Typography>
                </Box>
                <SwitcherPreview leadName={name} lead={me} members={members} />
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
      <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, mb: 1 }}>What {leadName.split(/\s+/)[0]} sees</Typography>
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
