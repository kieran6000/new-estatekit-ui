import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  ButtonBase,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { tokens } from "../theme";
import { clientPicture, listClients, type ClientCardRow, type StatusTone } from "../api/clients";
import ClientStatusChip from "../components/ClientStatusChip";
import { timeAgo } from "../lib/timeAgo";

type Filter = "all" | "attention" | "live" | "off";
type Sort = "urgency" | "name" | "leads";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "live", label: "Running" },
  { key: "off", label: "Paused / off" },
];

const TONE_RANK: Record<StatusTone, number> = { red: 0, amber: 1, green: 2, blue: 3, grey: 4 };

/** Imported from the old dashboard and never switched on here. */
function isSwitchedOff(c: ClientCardRow): boolean {
  return !c.onboarded && c.automations_paused;
}

function toneOf(c: ClientCardRow): StatusTone {
  return c.status?.tone ?? (isSwitchedOff(c) ? "grey" : "blue");
}

function cityOf(area: string): string {
  return (area || "").split(/[,/•|]/)[0].trim();
}

function matches(c: ClientCardRow, q: string): boolean {
  if (!q) return true;
  const hay = [c.display_name, c.company, c.area, c.email, c.whatsapp_number, c.status?.label, c.health]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function inFilter(c: ClientCardRow, f: Filter): boolean {
  const tone = toneOf(c);
  if (f === "attention") return tone === "red" || tone === "amber";
  if (f === "live") return tone === "green";
  if (f === "off") return tone === "grey";
  return true;
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const { data: clients, isLoading, isError } = useQuery({ queryKey: ["clients"], queryFn: listClients, staleTime: 60_000 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(() => {
    try { return (sessionStorage.getItem("estatekit_clients_filter") as Filter) || "all"; } catch { return "all"; }
  });
  const [sort, setSort] = useState<Sort>(() => {
    try { return (localStorage.getItem("estatekit_clients_sort") as Sort) || "urgency"; } catch { return "urgency"; }
  });
  useEffect(() => { try { sessionStorage.setItem("estatekit_clients_filter", filter); } catch { /* ignore */ } }, [filter]);
  useEffect(() => { try { localStorage.setItem("estatekit_clients_sort", sort); } catch { /* ignore */ } }, [sort]);

  const counts = useMemo(() => {
    const all = clients ?? [];
    return Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((c) => inFilter(c, f.key)).length])) as Record<Filter, number>;
  }, [clients]);

  const shown = useMemo(() => {
    const list = (clients ?? []).filter((c) => inFilter(c, filter) && matches(c, search.trim()));
    const name = (c: ClientCardRow) => (c.display_name || "").toLowerCase();
    return list.sort((a, b) => {
      if (sort === "leads") return (b.live?.leads_30d ?? 0) - (a.live?.leads_30d ?? 0) || name(a).localeCompare(name(b));
      if (sort === "urgency") return TONE_RANK[toneOf(a)] - TONE_RANK[toneOf(b)] || name(a).localeCompare(name(b));
      return name(a).localeCompare(name(b));
    });
  }, [clients, filter, search, sort]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/leads")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Clients</Typography>
          {clients && (
            <Typography sx={{ ml: 1, fontSize: 14, color: tokens.ink3 }}>{clients.length}</Typography>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, px: 2, py: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Box sx={{ display: "flex", gap: 1.25, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search name, agency, area, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: "1 1 260px" }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 20, color: tokens.ink3 }} />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch("")} aria-label="Clear search">
                      <CloseIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />
          <TextField select size="small" value={sort} onChange={(e) => setSort(e.target.value as Sort)} sx={{ minWidth: 190 }} label="Sort">
            <MenuItem value="urgency">Needs attention first</MenuItem>
            <MenuItem value="name">Name A–Z</MenuItem>
            <MenuItem value="leads">Most leads (30 days)</MenuItem>
          </TextField>
        </Box>
        <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pb: 0.25 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <ButtonBase
                key={f.key}
                onClick={() => setFilter(f.key)}
                sx={{
                  px: 1.5,
                  py: 0.625,
                  borderRadius: "999px",
                  border: `1px solid ${active ? "rgba(0,0,0,.6)" : tokens.divider}`,
                  bgcolor: active ? "rgba(0,0,0,.06)" : "transparent",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? tokens.ink : tokens.ink2,
                  whiteSpace: "nowrap",
                }}
              >
                {f.label}
                {clients && <Box component="span" sx={{ ml: 0.75, color: tokens.ink3, fontWeight: 500 }}>{counts[f.key]}</Box>}
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ p: 2, maxWidth: 1400, mx: "auto" }}>
        {isError && (
          <Typography sx={{ color: tokens.ink2, p: 2 }}>
            Couldn't load your clients. Check your connection and refresh the page.
          </Typography>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 1.5 }}>
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rounded" height={196} />)}
          {shown.map((c) => (
            <ClientCard key={c.agent_id} c={c} onOpen={() => navigate(`/admin/clients/${c.agent_id}`)} />
          ))}
        </Box>

        {clients && shown.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6, color: tokens.ink2 }}>
            <Typography sx={{ fontWeight: 500 }}>No clients match</Typography>
            <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>Try a different name, or switch the filter back to All.</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ClientCard({ c, onOpen }: { c: ClientCardRow; onOpen: () => void }) {
  const name = c.display_name || c.whatsapp_number || "Unnamed account";
  const pic = clientPicture(c);
  const city = cityOf(c.area);
  const status = c.status ?? (isSwitchedOff(c) ? { label: "Switched off", tone: "grey" as const } : { label: "Onboarding", tone: "blue" as const });
  const leads30 = c.live?.leads_30d ?? 0;
  const lastLead = c.live?.last_lead_at ? timeAgo(c.live.last_lead_at) : "never";

  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        bgcolor: "background.paper",
        border: `1px solid ${tokens.divider}`,
        borderRadius: "8px",
        overflow: "hidden",
        transition: "box-shadow .15s, border-color .15s",
        "&:hover": { borderColor: "rgba(0,0,0,.24)", boxShadow: "0 2px 8px rgba(0,0,0,.08)" },
        "&:focus-visible": { outline: `2px solid ${tokens.primary}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ p: 2, pb: 1.5, display: "flex", gap: 1.5, alignItems: "center" }}>
        <Avatar src={pic} alt={name} sx={{ width: 56, height: 56, fontSize: 22, fontWeight: 600, bgcolor: c.sidebar_color || "#111827" }}>
          {name[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </Typography>
          <Typography sx={{ fontSize: 13, color: tokens.ink2, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.company || "No agency on file"}
          </Typography>
          {city && (
            <Typography sx={{ fontSize: 12.5, color: tokens.ink3, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {city}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ px: 2, display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
        <ClientStatusChip label={status.label} tone={status.tone} />
        {c.health && c.health !== "Satisfied" && status.label !== c.health && (
          <Typography component="span" sx={{ fontSize: 11.5, color: tokens.ink2 }}>
            {c.health}
          </Typography>
        )}
      </Box>

      <Typography
        sx={{
          px: 2,
          pt: 1,
          fontSize: 12.5,
          color: tokens.ink2,
          lineHeight: 1.4,
          minHeight: 36,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {c.nextAction || " "}
      </Typography>

      <Box sx={{ mt: "auto", pt: 1.5 }} />
      <Box sx={{ display: "flex", borderTop: `1px solid ${tokens.divider2}` }}>
        <Stat label="Leads 30d" value={String(leads30)} />
        <Stat label="All time" value={String(c.live?.leads_total ?? 0)} />
        <Stat label="Last lead" value={lastLead} />
      </Box>
    </ButtonBase>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ flex: 1, px: 1.5, py: 1, "& + &": { borderLeft: `1px solid ${tokens.divider2}` } }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{value}</Typography>
      <Typography sx={{ fontSize: 11, color: tokens.ink3, lineHeight: 1.3 }}>{label}</Typography>
    </Box>
  );
}
