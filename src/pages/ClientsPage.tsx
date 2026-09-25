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
import { clientPicture, cplLabel, getSpend30d, listClients, type ClientCardRow } from "../api/clients";
import { timeAgo } from "../lib/timeAgo";

type Sort = "leads" | "name";

function cityOf(area: string): string {
  return (area || "").split(/[,/•|]/)[0].trim();
}

function matches(c: ClientCardRow, q: string): boolean {
  if (!q) return true;
  const hay = [c.display_name, c.company, c.area, c.email, c.whatsapp_number].filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const { data: clients, isLoading, isError } = useQuery({ queryKey: ["clients"], queryFn: listClients, staleTime: 60_000 });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>(() => {
    try { return localStorage.getItem("estatekit_clients_sort") === "name" ? "name" : "leads"; } catch { return "leads"; }
  });
  useEffect(() => { try { localStorage.setItem("estatekit_clients_sort", sort); } catch { /* ignore */ } }, [sort]);

  const shown = useMemo(() => {
    const list = (clients ?? []).filter((c) => matches(c, search.trim()));
    const name = (c: ClientCardRow) => (c.display_name || "").toLowerCase();
    return list.sort((a, b) =>
      sort === "leads"
        ? (b.live?.leads_30d ?? 0) - (a.live?.leads_30d ?? 0) || name(a).localeCompare(name(b))
        : name(a).localeCompare(name(b)),
    );
  }, [clients, search, sort]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/leads")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Clients</Typography>
          {clients && <Typography sx={{ ml: 1, fontSize: 14, color: tokens.ink3 }}>{clients.length}</Typography>}
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, px: 2, py: 1.5, display: "flex", gap: 1.25, flexWrap: "wrap" }}>
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
          <MenuItem value="leads">Most leads (30 days)</MenuItem>
          <MenuItem value="name">Name A–Z</MenuItem>
        </TextField>
      </Box>

      <Box sx={{ p: 2, maxWidth: 1400, mx: "auto" }}>
        {isError && (
          <Typography sx={{ color: tokens.ink2, p: 2 }}>
            Couldn't load your clients. Check your connection and refresh the page.
          </Typography>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 1.5 }}>
          {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rounded" height={148} />)}
          {shown.map((c) => (
            <ClientCard key={c.agent_id} c={c} onOpen={() => navigate(`/admin/clients/${c.agent_id}`)} />
          ))}
        </Box>

        {clients && shown.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6, color: tokens.ink2 }}>
            <Typography sx={{ fontWeight: 500 }}>No clients match</Typography>
            <Typography sx={{ fontSize: 13.5, mt: 0.5 }}>Try a different name, agency or area.</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ClientCard({ c, onOpen }: { c: ClientCardRow; onOpen: () => void }) {
  const name = c.display_name || c.whatsapp_number || "Unnamed account";
  const city = cityOf(c.area);
  const leads30 = c.live?.leads_30d ?? 0;
  const { data: spend, isLoading: spendLoading } = useQuery({
    queryKey: ["spend30d", c.fb_ad_account_id],
    queryFn: () => getSpend30d(c.fb_ad_account_id!),
    enabled: !!c.fb_ad_account_id,
    staleTime: 30 * 60_000,
    retry: false,
  });

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
      <Box sx={{ p: 2, display: "flex", gap: 1.5, alignItems: "center", flex: 1 }}>
        <Avatar src={clientPicture(c)} alt={name} sx={{ width: 56, height: 56, fontSize: 22, fontWeight: 600, bgcolor: c.sidebar_color || "#111827" }}>
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

      <Box sx={{ display: "flex", borderTop: `1px solid ${tokens.divider2}` }}>
        <Stat label="Leads 30d" value={String(leads30)} />
        <Stat label="CPL 30d" value={c.fb_ad_account_id && spendLoading ? null : cplLabel(spend, leads30)} />
        <Stat label="Last lead" value={c.live?.last_lead_at ? timeAgo(c.live.last_lead_at) : "never"} />
      </Box>
    </ButtonBase>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <Box sx={{ flex: 1, px: 1.5, py: 1, "& + &": { borderLeft: `1px solid ${tokens.divider2}` } }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{value ?? <Skeleton width={40} />}</Typography>
      <Typography sx={{ fontSize: 11, color: tokens.ink3, lineHeight: 1.3 }}>{label}</Typography>
    </Box>
  );
}
