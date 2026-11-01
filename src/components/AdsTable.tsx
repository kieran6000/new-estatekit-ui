import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar, Box, Button, ButtonBase, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Paper, Popper, Radio, Skeleton, Switch, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import PhotoOutlinedIcon from "@mui/icons-material/PhotoOutlined";
import ViewColumnOutlinedIcon from "@mui/icons-material/ViewColumnOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import TuneIcon from "@mui/icons-material/Tune";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { getAdsTable, setAdStatus, type AdsLevel, type AdsRow } from "../api/agentProfile";
import { METRICS, adsMoney, formatMetric, metricValues, sumRows, toneOf, type MetricKey, type Tone } from "../lib/adTargets";
import { ALL_COLUMNS, COLUMN_LABEL, PRESETS, choiceLabel, loadPrefs, savePrefs, visibleColumns, type ColId, type ColumnPrefs, type PresetKey } from "../lib/adColumns";
import { useSnack } from "../hooks/useSnack";

// The client page's ads table, made to look and work like Ads Manager:
// Campaigns / Ad sets / Ads folder tabs with "1 selected" on the tab you
// came from, an Off/On switch per row, Facebook's own columns with column
// presets, your own set and widths you drag (lib/adColumns), and the small
// grey label under each number. Click a campaign to open its ad sets, an ad
// set to open its ads. Hover an ad's picture for its preview. Cells are
// tinted against the media buyer's targets ("Conditional formatting").

export interface AdsView { level: AdsLevel; campaignId: string | null; adsetId: string | null }

// Ads Manager's colours.
const FB = { text: "#1c2b33", sub: "#65676b", line: "#dddfe2", head: "#ffffff", zebra: "#f5f6f7", hover: "#e9eef6", link: "#0a66c2", blue: "#0866ff", tabOff: "#f0f2f5", selected: "#e7f0fe", pill: "#0866ff" };
const TONE_BG: Record<Tone, string | undefined> = { good: "#e6f4ea", near: "#fef7e0", bad: "#fce8e6", none: undefined };
const LEVEL_WORD: Record<AdsLevel, { one: string; many: string; title: string }> = {
  campaign: { one: "campaign", many: "campaigns", title: "Campaign" },
  adset: { one: "ad set", many: "ad sets", title: "Ad set" },
  ad: { one: "ad", many: "ads", title: "Ad" },
};
const DEFAULT_W: Partial<Record<ColId | "name", number>> = { delivery: 150, budget: 160, ends: 110, cpm: 200, ctr: 200, cpc: 190 };
const defaultWidth = (id: ColId | "name", level: AdsLevel) => (id === "name" ? (level === "ad" ? 380 : 320) : DEFAULT_W[id] ?? 130);

// Ads Manager's "Delivery" words.
const DELIVERY: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: "#31a24c" },
  PAUSED: { label: "Off", color: "#bec3c9" },
  CAMPAIGN_PAUSED: { label: "Campaign off", color: "#bec3c9" },
  ADSET_PAUSED: { label: "Ad set off", color: "#bec3c9" },
  IN_PROCESS: { label: "In process", color: "#f7b928" },
  PENDING_REVIEW: { label: "In review", color: "#f7b928" },
  WITH_ISSUES: { label: "With issues", color: "#e41e3f" },
  DISAPPROVED: { label: "Rejected", color: "#e41e3f" },
};

/** "Leads (Form)" -> "Per Lead (Form)", as under Cost per result. */
const perResult = (t: string) => (t ? `Per ${t.replace(/^Leads/, "Lead").replace(/^Website leads$/, "Website lead")}` : "");
const ctaLabel = (cta: string) => (cta ? cta.toLowerCase().split("_").map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(" ") : "Learn more");
const domain = (link: string) => { try { return new URL(link).hostname.replace(/^www\./, "").toUpperCase(); } catch { return ""; } };
const fbDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** A number with Ads Manager's small grey label under it. */
function Num({ v, sub }: { v: ReactNode; sub?: string }) {
  return (
    <>
      <Box sx={{ color: FB.text }}>{v}</Box>
      {sub && <Box sx={{ fontSize: 12, color: FB.sub, lineHeight: 1.3 }}>{sub}</Box>}
    </>
  );
}

export default function AdsTable({ adAccountId, since, until, view, onView, pageName, pageAvatar }: {
  adAccountId: string | null; since: string; until: string;
  view: AdsView; onView: (v: AdsView) => void;
  /** Shown at the top of the ad preview, as on Facebook. */
  pageName: string; pageAvatar?: string;
}) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [sort, setSort] = useState<{ k: MetricKey | "name"; dir: 1 | -1 }>({ k: "spend", dir: -1 });
  const [confirm, setConfirm] = useState<{ row: AdsRow; on: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ el: HTMLElement; row: AdsRow } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [prefs, setPrefsState] = useState<ColumnPrefs>(loadPrefs);
  const setPrefs = (p: ColumnPrefs) => { setPrefsState(p); savePrefs(p); };
  const [colMenu, setColMenu] = useState<HTMLElement | null>(null);
  const [customizing, setCustomizing] = useState<ColId[] | null>(null);

  // What to fetch: every campaign at campaign level (the selected one stays
  // selected), else the selected campaign's ad sets or ad set's ads.
  const fetchView: AdsView = view.level === "campaign"
    ? { level: "campaign", campaignId: null, adsetId: null }
    : view.level === "adset" ? { level: "adset", campaignId: view.campaignId, adsetId: null } : view;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["adsTable", adAccountId, since, until, fetchView.level, fetchView.campaignId, fetchView.adsetId],
    queryFn: () => getAdsTable(adAccountId!, since, until, fetchView),
    enabled: !!adAccountId,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const rows = (data?.rows ?? []).map((r) => ({ r, v: metricValues(r) }));
  rows.sort((a, b) => (sort.k === "name" ? a.r.name.localeCompare(b.r.name) * sort.dir : ((a.v[sort.k] ?? -Infinity) - (b.v[sort.k] ?? -Infinity)) * sort.dir));
  // Reach and frequency can't be added up (people repeat across rows); only
  // the account totals have them right.
  const totals = view.level === "campaign" && data?.account ? data.account : sumRows(rows.map((x) => x.r));
  const totalV = metricValues(totals);
  const word = LEVEL_WORD[view.level];
  const onSort = (k: MetricKey | "name") => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));
  const clickable = view.level !== "ad";
  const selectedId = view.level === "campaign" ? view.campaignId : view.level === "adset" ? view.adsetId : null;
  const open = (r: AdsRow) => {
    if (view.level === "campaign") onView({ level: "adset", campaignId: r.id, adsetId: null });
    else if (view.level === "adset") onView({ level: "ad", campaignId: r.campaign?.id ?? view.campaignId, adsetId: r.id });
  };

  async function switchIt(row: AdsRow, on: boolean) {
    setConfirm(null);
    setBusy(row.id);
    try {
      await setAdStatus(row.id, on ? "ACTIVE" : "PAUSED");
      await qc.invalidateQueries({ queryKey: ["adsTable", adAccountId] });
      showSnack(`${row.name} is ${on ? "on" : "off"}`);
    } catch (e) {
      console.error(e);
      showSnack("Facebook didn't take that. Try again, or change it in Ads Manager.");
    } finally {
      setBusy(null);
    }
  }

  // ── Tabs: folder tabs, the open one white; "1 selected ×" where you came from ──
  const tabs: { level: AdsLevel; icon: (on: boolean) => ReactNode; label: string; selected: boolean; clear?: () => void }[] = [
    {
      level: "campaign",
      icon: () => <CampaignOutlinedIcon sx={{ fontSize: 22 }} />,
      label: "Campaigns",
      selected: !!view.campaignId,
      clear: () => onView({ level: view.level, campaignId: null, adsetId: null }),
    },
    {
      level: "adset",
      icon: () => <LayersOutlinedIcon sx={{ fontSize: 22 }} />,
      label: view.campaignId ? "Ad sets for 1 Campaign" : "Ad sets",
      selected: !!view.adsetId,
      clear: () => onView({ level: view.level, campaignId: view.campaignId, adsetId: null }),
    },
    { level: "ad", icon: () => <PhotoOutlinedIcon sx={{ fontSize: 22 }} />, label: view.adsetId ? "Ads for 1 Ad set" : view.campaignId ? "Ads for 1 Campaign" : "Ads", selected: false },
  ];
  // Moving between tabs keeps what's selected, as in Ads Manager.
  const pickTab = (l: AdsLevel) => onView({ level: l, campaignId: view.campaignId, adsetId: l === "campaign" ? view.adsetId : view.adsetId });

  // ── Columns ──
  const colIds = visibleColumns(prefs, view.level);
  const width = (id: ColId | "name") => prefs.widths[id] ?? defaultWidth(id, view.level);
  const metricOf = (id: ColId) => METRICS.find((m) => m.key === id);
  // Drag a column's right edge to resize it (remembered).
  const startResize = (id: ColId | "name", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = width(id);
    let latest = prefs;
    const move = (ev: MouseEvent) => {
      latest = { ...latest, widths: { ...latest.widths, [id]: Math.max(80, Math.round(w0 + ev.clientX - x0)) } };
      setPrefsState(latest);
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); savePrefs(latest); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const resizer = (id: ColId | "name") => (
    <Box
      onMouseDown={(e) => startResize(id, e)}
      onClick={(e) => e.stopPropagation()}
      aria-hidden
      sx={{ position: "absolute", top: 0, right: -3, bottom: 0, width: 7, cursor: "col-resize", zIndex: 4, "&:hover": { bgcolor: "rgba(8,102,255,0.35)" } }}
    />
  );

  const cell = (id: ColId, r: AdsRow, v: ReturnType<typeof metricValues>) => {
    if (id === "delivery") {
      const d = DELIVERY[r.delivery] ?? { label: r.delivery.toLowerCase().replace(/_/g, " "), color: "#bec3c9" };
      return <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}><Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: d.color, flex: "none" }} />{d.label}</Box>;
    }
    if (id === "budget") {
      if (r.dailyBudget) return <Num v={adsMoney(r.dailyBudget)} sub="Daily" />;
      if (r.lifetimeBudget) return <Num v={adsMoney(r.lifetimeBudget)} sub="Lifetime" />;
      return <Box sx={{ color: FB.text, overflow: "hidden", textOverflow: "ellipsis" }}>{view.level === "campaign" ? "Using ad set budget" : "Using campaign budget"}</Box>;
    }
    if (id === "ends") return <Box sx={{ color: FB.text }}>{r.ends ? fbDate(r.ends) : "Ongoing"}</Box>;
    const sub = id === "leads" ? (r.leads ? r.resultType || "Leads" : "") : id === "cpl" ? (r.leads ? perResult(r.resultType || "Leads") : "") : undefined;
    return <Num v={formatMetric(id, v[id])} sub={sub} />;
  };

  const stickyLeft = (left: number, w: number) => ({ position: "sticky", left, zIndex: 1, minWidth: w, maxWidth: w, width: w } as const);
  const headCell = { bgcolor: FB.head, color: FB.text, fontSize: 13, fontWeight: 600, py: 1, px: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderRight: `1px solid ${FB.line}`, borderBottom: `1px solid ${FB.line}`, lineHeight: 1.25, verticalAlign: "middle", position: "relative" } as const;
  const nameW = width("name");

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* Folder tabs */}
      <Box role="tablist" aria-label="Campaigns, ad sets and ads" sx={{ display: "flex", gap: 0.75, alignItems: "flex-end", px: 0.5 }}>
        {tabs.map((t) => {
          const on = view.level === t.level;
          return (
            <ButtonBase
              key={t.level}
              component="div"
              role="tab"
              tabIndex={0}
              aria-selected={on}
              onClick={() => pickTab(t.level)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickTab(t.level); } }}
              sx={{
                flex: "0 1 300px", minWidth: 0, justifyContent: "flex-start", gap: 1.25, px: 2, height: on ? 48 : 44,
                bgcolor: on ? "#fff" : FB.tabOff, color: on ? FB.link : FB.text, fontSize: 15, fontWeight: 600,
                border: `1px solid ${FB.line}`, borderBottom: on ? "1px solid #fff" : `1px solid ${FB.line}`, borderRadius: "8px 8px 0 0",
                mb: "-1px", position: "relative", zIndex: on ? 2 : 1,
                "&:hover": { bgcolor: on ? "#fff" : "#e4e6eb" },
                "&.Mui-focusVisible": { outline: `2px solid ${FB.blue}`, outlineOffset: -2 },
              }}
            >
              <Box sx={{ color: on ? FB.blue : FB.text, display: "flex", flex: "none" }}>{t.icon(on)}</Box>
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto" }}>{t.label}</Box>
              {t.selected && t.clear && (
                <Box
                  component="span"
                  sx={{ ml: "auto", flex: "none", display: "inline-flex", alignItems: "center", gap: 0.5, bgcolor: FB.pill, color: "#fff", borderRadius: "6px", pl: 1, pr: 0.25, height: 26, fontSize: 13, fontWeight: 600 }}
                >
                  1 selected
                  <IconButton
                    size="small"
                    aria-label={`Clear the selected ${t.level === "campaign" ? "campaign" : "ad set"}`}
                    onClick={(e) => { e.stopPropagation(); t.clear!(); }}
                    sx={{ color: "#fff", p: 0.25, "&:hover": { bgcolor: "rgba(255,255,255,0.18)" } }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              )}
            </ButtonBase>
          );
        })}
      </Box>

      <Box sx={{ bgcolor: "#fff", border: `1px solid ${FB.line}`, borderRadius: "0 8px 8px 8px", overflow: "hidden", position: "relative", zIndex: 1 }}>
        {/* Toolbar: the column chooser, as in Ads Manager. */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderBottom: `1px solid ${FB.line}` }}>
          <Typography sx={{ fontSize: 13, color: FB.sub, mr: "auto" }}>
            {rows.length ? `${rows.length} ${rows.length === 1 ? word.one : word.many}` : ""}
          </Typography>
          <Button
            variant="outlined"
            onClick={(e) => setColMenu(e.currentTarget)}
            startIcon={<ViewColumnOutlinedIcon />}
            endIcon={<ArrowDropDownIcon />}
            aria-haspopup="menu"
            color="inherit"
            sx={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: 14, borderColor: "divider", minHeight: 40, whiteSpace: "nowrap" }}
          >
            <b>Columns:</b>&nbsp;{choiceLabel(prefs)}
          </Button>
          <Menu anchorEl={colMenu} open={!!colMenu} onClose={() => setColMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ paper: { sx: { minWidth: 300 } } }}>
            <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontWeight: 700, fontSize: 15 }}>Columns</Typography>
            <MenuItem onClick={() => { setColMenu(null); setCustomizing(visibleColumns(prefs, "campaign")); }}>
              <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Customize columns</ListItemText>
            </MenuItem>
            <Divider />
            <Typography sx={{ px: 2, pt: 0.5, pb: 0.5, fontWeight: 700, fontSize: 14 }}>Presets</Typography>
            {(["performance_clicks", "performance"] as PresetKey[]).map((k) => (
              <MenuItem key={k} selected={prefs.choice === k} onClick={() => { setPrefs({ ...prefs, choice: k }); setColMenu(null); }}>
                <ListItemIcon><Radio size="small" checked={prefs.choice === k} sx={{ p: 0 }} tabIndex={-1} /></ListItemIcon>
                <ListItemText>{PRESETS[k].label}</ListItemText>
              </MenuItem>
            ))}
            {prefs.choice === "custom" || prefs.custom.length ? (
              <MenuItem selected={prefs.choice === "custom"} onClick={() => { setPrefs({ ...prefs, choice: "custom" }); setColMenu(null); }}>
                <ListItemIcon><Radio size="small" checked={prefs.choice === "custom"} sx={{ p: 0 }} tabIndex={-1} /></ListItemIcon>
                <ListItemText>Custom</ListItemText>
              </MenuItem>
            ) : null}
            <Divider />
            <MenuItem onClick={() => setPrefs({ ...prefs, tint: !prefs.tint })}>
              <ListItemIcon><FormatColorFillIcon fontSize="small" /></ListItemIcon>
              <ListItemText secondary="Colour against the targets">Conditional formatting</ListItemText>
              <Checkbox size="small" checked={prefs.tint} tabIndex={-1} sx={{ p: 0, ml: 1 }} />
            </MenuItem>
            <MenuItem onClick={() => { setPrefs({ ...prefs, widths: {} }); setColMenu(null); }}>
              <ListItemIcon><RestartAltIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Reset column width</ListItemText>
            </MenuItem>
          </Menu>
        </Box>

        {!adAccountId ? (
          <Typography sx={{ p: 2, fontSize: 14, color: FB.sub }}>No ad account linked. Add it under Settings → Ads &amp; Facebook.</Typography>
        ) : isLoading ? (
          <Box sx={{ p: 2 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} />)}</Box>
        ) : isError || data?.note ? (
          <Typography sx={{ p: 2, fontSize: 14, color: FB.sub }}>
            {isError ? `Couldn't load the ${word.many}. Try again in a minute.` : data?.note === "busy" ? "Facebook is busy right now. Try again in a few minutes." : "Couldn't read this ad account from Meta. Check it's shared with EstateKit."}
          </Typography>
        ) : !rows.length ? (
          <Typography sx={{ p: 2, fontSize: 14, color: FB.sub }}>No {word.many} ran in these dates.</Typography>
        ) : (
          <>
            <Box sx={{ overflow: "auto", maxHeight: 640 }}>
              <Table size="small" stickyHeader sx={{ tableLayout: "fixed", width: "max-content", borderCollapse: "separate", "& td": { borderBottom: 0, fontSize: 13.5, px: 1.25, py: 0.9, verticalAlign: "top", overflow: "hidden" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...headCell, ...stickyLeft(0, 72), zIndex: 3 }}>Off / On</TableCell>
                    <TableCell sx={{ ...headCell, ...stickyLeft(72, nameW), zIndex: 3 }}>
                      <TableSortLabel active={sort.k === "name"} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort("name")}>{word.title}</TableSortLabel>
                      {resizer("name")}
                    </TableCell>
                    {colIds.map((id) => {
                      const m = metricOf(id);
                      const w = width(id);
                      return (
                        <TableCell key={id} align={id === "delivery" ? "left" : "right"} sx={{ ...headCell, width: w, minWidth: w, maxWidth: w }}>
                          {m ? (
                            <Tooltip title={m.target ? `${m.label} · Target: ${m.target}` : m.label}>
                              <TableSortLabel active={sort.k === m.key} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort(m.key)} sx={{ maxWidth: "100%", "& > span": { overflow: "hidden", textOverflow: "ellipsis" } }}>
                                {COLUMN_LABEL[id]}
                              </TableSortLabel>
                            </Tooltip>
                          ) : COLUMN_LABEL[id]}
                          {resizer(id)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(({ r, v }, i) => {
                    const sel = r.id === selectedId;
                    const bg = sel ? FB.selected : i % 2 ? FB.zebra : "#fff";
                    return (
                      <TableRow
                        key={r.id}
                        tabIndex={clickable ? 0 : undefined}
                        aria-selected={sel || undefined}
                        onClick={clickable ? () => open(r) : undefined}
                        onKeyDown={clickable ? (e) => { if (e.key === "Enter") { e.preventDefault(); open(r); } } : undefined}
                        sx={{
                          cursor: clickable ? "pointer" : "default",
                          opacity: busy === r.id ? 0.5 : 1,
                          "& > td": { bgcolor: bg },
                          "&:hover > td": { bgcolor: sel ? FB.selected : FB.hover },
                          "& > td:first-of-type": sel ? { boxShadow: `inset 3px 0 0 ${FB.blue}` } : {},
                          "&:focus-visible": { outline: `2px solid ${FB.blue}`, outlineOffset: -2 },
                          "&:hover .ek-name": { textDecoration: "underline" },
                          "&:hover .ek-ext": { opacity: 1 },
                        }}
                      >
                        <TableCell sx={{ ...stickyLeft(0, 72), py: "6px !important" }}>
                          <Tooltip title={r.status === "ACTIVE" ? `Turn this ${word.one} off` : `Turn this ${word.one} on`}>
                            <Switch
                              checked={r.status === "ACTIVE"}
                              disabled={busy === r.id}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setConfirm({ row: r, on: e.target.checked })}
                              slotProps={{ input: { "aria-label": `${r.name}: ${r.status === "ACTIVE" ? "on" : "off"}` } }}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ ...stickyLeft(72, nameW), borderRight: `1px solid ${FB.line}` }}>
                          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, minWidth: 0 }}>
                            {view.level === "ad" && (
                              <Box
                                onMouseEnter={(e) => { const el = e.currentTarget; clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setPreview({ el, row: r }), 200); }}
                                onMouseLeave={() => { clearTimeout(hoverTimer.current); setPreview(null); }}
                                sx={{ width: 36, height: 36, flex: "none", borderRadius: "4px", overflow: "hidden", bgcolor: FB.tabOff, display: "grid", placeItems: "center", cursor: "zoom-in", border: `1px solid ${FB.line}` }}
                              >
                                {r.creative?.image ? <Box component="img" src={r.creative.image} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageOutlinedIcon sx={{ fontSize: 18, color: FB.sub }} />}
                              </Box>
                            )}
                            <Tooltip title={r.created ? `${r.name} · Created ${fbDate(r.created)}` : r.name} placement="top-start">
                              <Box className="ek-name" sx={{ flex: 1, minWidth: 0, color: clickable ? FB.link : FB.text, fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pt: view.level === "ad" ? 0.75 : 0 }}>{r.name}</Box>
                            </Tooltip>
                            {!clickable && (
                              <Tooltip title="Open in Ads Manager">
                                <IconButton
                                  className="ek-ext"
                                  size="small"
                                  component="a"
                                  href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${adAccountId.replace(/^act_/, "")}&selected_ad_ids=${r.id}`}
                                  target="_blank"
                                  rel="noopener"
                                  aria-label={`Open ${r.name} in Ads Manager`}
                                  sx={{ opacity: 0.35, flex: "none", "&:focus-visible": { opacity: 1 } }}
                                >
                                  <OpenInNewIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        {colIds.map((id) => {
                          const m = metricOf(id);
                          const tone = m && prefs.tint && !sel ? TONE_BG[toneOf(m, v[m.key], r)] : undefined;
                          return (
                            <TableCell key={id} align={id === "delivery" ? "left" : "right"} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textOverflow: "ellipsis", ...(tone ? { bgcolor: `${tone} !important` } : {}) }}>
                              {cell(id, r, v)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ position: "sticky", bottom: 0, zIndex: 2, "& > td": { bgcolor: "#fff", borderTop: `1px solid ${FB.line}`, fontWeight: 600, whiteSpace: "nowrap" } }}>
                    <TableCell sx={{ ...stickyLeft(0, 72) }} />
                    <TableCell sx={{ ...stickyLeft(72, nameW), borderRight: `1px solid ${FB.line}` }}>
                      <Num v={`Results from ${rows.length} ${rows.length === 1 ? word.one : word.many}`} sub="Excludes deleted items" />
                    </TableCell>
                    {colIds.map((id) => {
                      const m = metricOf(id);
                      return (
                        <TableCell key={id} align={id === "delivery" ? "left" : "right"} sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {m ? <Num v={formatMetric(m.key, totalV[m.key])} sub={m.key === "spend" ? "Total spent" : m.key === "leads" ? "Total" : m.key === "cpl" ? "Per result" : m.key === "reach" && totalV.reach !== null ? "Accounts Center accounts" : undefined} /> : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
            {prefs.tint && (
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", p: "8px 12px", fontSize: 12, color: FB.sub, borderTop: `1px solid ${FB.line}` }}>
                {(["good", "near", "bad"] as const).map((t) => (
                  <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Box sx={{ width: 12, height: 12, bgcolor: TONE_BG[t], border: `1px solid ${FB.line}` }} />
                    {t === "good" ? "On target" : t === "near" ? "Close (within 20%)" : "Off target"}
                  </Box>
                ))}
                <span>Targets: hover a column name. No colour under R150 spent or fewer than 3 results.</span>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* The ad as it shows on Facebook. */}
      <Popper open={!!preview} anchorEl={preview?.el} placement="right-start" sx={{ zIndex: 1500, pointerEvents: "none" }} modifiers={[{ name: "offset", options: { offset: [0, 12] } }, { name: "preventOverflow", options: { padding: 12 } }]}>
        {preview?.row.creative && <AdPreview c={preview.row.creative} pageName={pageName} pageAvatar={pageAvatar} />}
      </Popper>

      {/* Customize columns: tick the ones to show, move them up or down. */}
      <Dialog open={!!customizing} onClose={() => setCustomizing(null)} fullWidth maxWidth="xs">
        <DialogTitle>Customize columns</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {customizing && [...customizing, ...ALL_COLUMNS.filter((c) => !customizing.includes(c))].map((id) => {
            const on = customizing.includes(id);
            const at = customizing.indexOf(id);
            const move = (d: -1 | 1) => {
              const next = [...customizing];
              [next[at], next[at + d]] = [next[at + d], next[at]];
              setCustomizing(next);
            };
            return (
              <Box key={id} sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.25, borderBottom: `1px solid ${FB.zebra}` }}>
                <Checkbox
                  size="small"
                  checked={on}
                  onChange={() => setCustomizing(on ? customizing.filter((c) => c !== id) : [...customizing, id])}
                  slotProps={{ input: { "aria-label": COLUMN_LABEL[id] } }}
                />
                <Typography sx={{ flex: 1, fontSize: 14, color: on ? FB.text : FB.sub }}>{COLUMN_LABEL[id]}</Typography>
                {on && (
                  <>
                    <IconButton size="small" disabled={at === 0} onClick={() => move(-1)} aria-label={`Move ${COLUMN_LABEL[id]} left`}><ArrowUpwardIcon sx={{ fontSize: 16 }} /></IconButton>
                    <IconButton size="small" disabled={at === customizing.length - 1} onClick={() => move(1)} aria-label={`Move ${COLUMN_LABEL[id]} right`}><ArrowDownwardIcon sx={{ fontSize: 16 }} /></IconButton>
                  </>
                )}
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomizing(null)}>Cancel</Button>
          <Button variant="contained" disabled={!customizing?.length} onClick={() => { setPrefs({ ...prefs, choice: "custom", custom: customizing! }); setCustomizing(null); }}>Apply</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)}>
        <DialogTitle>Turn {confirm?.on ? "on" : "off"} this {word.one}?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14.5 }}>
            <b>{confirm?.row.name}</b> {confirm?.on ? "starts delivering again" : "stops delivering and spending"} straight away on Facebook.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="contained" color={confirm?.on ? "primary" : "error"} onClick={() => confirm && void switchIt(confirm.row, confirm.on)}>
            Turn {confirm?.on ? "on" : "off"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** A Facebook feed ad: page, text, image, then the link bar with the button. */
function AdPreview({ c, pageName, pageAvatar }: { c: NonNullable<AdsRow["creative"]>; pageName: string; pageAvatar?: string }) {
  return (
    <Paper elevation={8} sx={{ width: 320, borderRadius: "10px", overflow: "hidden", color: "#1c1e21" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.25 }}>
        <Avatar src={pageAvatar} sx={{ width: 36, height: 36, fontSize: 15 }}>{pageName[0]}</Avatar>
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{pageName}</Typography>
          <Typography sx={{ fontSize: 12, color: "#65676b" }}>Sponsored</Typography>
        </Box>
      </Box>
      {c.body && <Typography sx={{ fontSize: 14, px: 1.5, pb: 1, whiteSpace: "pre-line", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.body}</Typography>}
      {c.image ? <Box component="img" src={c.image} alt="" sx={{ width: "100%", display: "block", maxHeight: 320, objectFit: "cover", bgcolor: "#f0f2f5" }} /> : <Box sx={{ height: 160, bgcolor: "#f0f2f5" }} />}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.25, bgcolor: "#f0f2f5" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {c.link && <Typography sx={{ fontSize: 12, color: "#65676b" }} noWrap>{domain(c.link)}</Typography>}
          {c.title && <Typography sx={{ fontSize: 14.5, fontWeight: 600 }} noWrap>{c.title}</Typography>}
        </Box>
        <Box sx={{ bgcolor: "#e4e6eb", borderRadius: "6px", px: 1.5, py: 0.75, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{ctaLabel(c.cta)}</Box>
      </Box>
    </Paper>
  );
}
