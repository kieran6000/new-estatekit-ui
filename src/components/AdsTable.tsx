import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar, Box, Button, ButtonBase, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Paper, Popper, Radio, Skeleton, Switch, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import WebAssetOutlinedIcon from "@mui/icons-material/WebAssetOutlined";
import ViewWeekOutlinedIcon from "@mui/icons-material/ViewWeekOutlined";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import InfoIcon from "@mui/icons-material/Info";
import CheckIcon from "@mui/icons-material/Check";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
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
// Campaigns / Ad sets / Ads folder tabs with "N selected" on the tab you
// came from, an Off/On switch per row, Facebook's own columns with column
// presets, your own set and widths you drag (lib/adColumns), and the small
// grey label under each number. Click a campaign to open its ad sets, an ad
// set to open its ads. Hover an ad's picture for its preview. Cells are
// tinted against the media buyer's targets ("Conditional formatting").

export interface AdsView { level: AdsLevel; campaignIds: string[]; adsetIds: string[] }

// Ads Manager's colours.
const FB = { text: "#1c2b33", sub: "#65676b", line: "#dadde1", head: "#ffffff", zebra: "#f5f6f7", hover: "#f2f4f7", link: "#1b74e4", blue: "#1b74e4", tabOff: "#f5f6f7", selected: "#ebf5ff", pill: "#1b74e4", btnLine: "#ced0d4", green: "#1a7f45" };
// Ads Manager's own type (Segoe UI on Windows, SF on a Mac).
const FB_FONT = '"Optimistic Text Normal", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const TONE_BG: Record<Tone, string | undefined> = { good: "#e6f4ea", near: "#fef7e0", bad: "#fce8e6", none: undefined };
const LEVEL_WORD: Record<AdsLevel, { one: string; many: string; title: string }> = {
  campaign: { one: "campaign", many: "campaigns", title: "Campaign" },
  adset: { one: "ad set", many: "ad sets", title: "Ad set" },
  ad: { one: "ad", many: "ads", title: "Ad" },
};

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

const FB_CHECK = { p: 0.5, "&:hover": { bgcolor: "transparent" }, "&.Mui-focusVisible .ek-box": { borderColor: "#1b74e4", boxShadow: "0 0 0 2px rgba(27,116,228,0.25)" } } as const;
const boxSx = { width: 22, height: 22, borderRadius: "4px", border: "1px solid #ccd0d5", bgcolor: "#fff", display: "grid", placeItems: "center", boxSizing: "border-box" } as const;
const CHECK_ICONS = {
  icon: <Box className="ek-box" sx={boxSx} />,
  checkedIcon: <Box className="ek-box" sx={boxSx}><CheckIcon sx={{ fontSize: 18, color: "#1b74e4" }} /></Box>,
  indeterminateIcon: <Box className="ek-box" sx={boxSx}><Box sx={{ width: 10, height: 2, borderRadius: 1, bgcolor: "#1b74e4" }} /></Box>,
};
const FB_SWITCH = {
  // Ads Manager: a 40×22 pill, an 18px knob nearly filling it.
  width: 40, height: 22, p: 0, overflow: "visible", verticalAlign: "middle",
  "& .MuiSwitch-switchBase": { p: "2px", color: "#1c2b33", "&:hover": { bgcolor: "transparent" }, "&.Mui-focusVisible .MuiSwitch-thumb": { boxShadow: "0 0 0 3px rgba(27,116,228,0.3)" } },
  "& .MuiSwitch-thumb": { width: 18, height: 18, boxShadow: "none" },
  "& .MuiSwitch-track": { borderRadius: 11, bgcolor: "#fff", border: "1px solid #bcc0c4", opacity: 1, boxSizing: "border-box" },
  "& .MuiSwitch-switchBase.Mui-checked": { color: "#1b74e4", transform: "translateX(18px)" },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: "#c4ddfa", borderColor: "#c4ddfa", opacity: 1 },
  "& .Mui-disabled + .MuiSwitch-track": { opacity: 0.5 },
} as const;

// Four solid squares (Material's filled grid is drawn as outlines).
const GridFilledIcon = () => (
  <Box sx={{ width: 22, height: 22, display: "grid", gridTemplateColumns: "8px 8px", gridAutoRows: "8px", gap: "2px", placeContent: "center" }}>
    {[0, 1, 2, 3].map((i) => <Box key={i} sx={{ bgcolor: "currentColor", borderRadius: "2px" }} />)}
  </Box>
);
const AdFilledIcon = () => (
  <Box sx={{ width: 22, height: 22, display: "grid", placeItems: "center" }}>
    <Box sx={{ width: 18, height: 16, borderRadius: "2px", bgcolor: "currentColor", position: "relative", "&::after": { content: '""', position: "absolute", left: 3, right: 3, top: 4, height: "1.5px", bgcolor: "#fff", opacity: 0.85 } }} />
  </Box>
);
// A thin, quiet scrollbar with no arrows, darker while you use it.
const THIN_SCROLL = {
  "&::-webkit-scrollbar": { width: 10, height: 10 },
  "&::-webkit-scrollbar-button": { display: "none" },
  "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
  "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(0,0,0,0.18)", borderRadius: 8, border: "3px solid transparent", backgroundClip: "padding-box" },
  "&::-webkit-scrollbar-thumb:hover": { bgcolor: "rgba(0,0,0,0.35)" },
  "&::-webkit-scrollbar-corner": { bgcolor: "transparent" },
} as const;
const LEFT_COLS = new Set<ColId>(["delivery", "ends"]);
/** A picked menu row, as in Ads Manager: pale blue. */
const PICKED = { "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "#dbe7fb" }, "&.Mui-selected .MuiRadio-root": { color: "#1b74e4" } } as const;
/** Tooltips for the columns that aren't numbers. */
const COL_HELP: Partial<Record<ColId, string>> = {
  delivery: "Whether it's running right now. Off means it's paused and not spending.",
  budget: "How much it may spend: per day (Daily) or in total (Lifetime). \"Using ad set budget\" means each ad set has its own.",
  ends: "When it stops by itself. Ongoing means it runs until someone turns it off.",
};
/** Ads Manager's shorter header names. */
const SHORT_LABEL: Partial<Record<ColId, string>> = {
  leads: "Results", cpl: "Cost per result", cpm: "CPM (cost per 1,000 impressions)", ctr: "CTR (link click-through rate)", cpc: "CPC (cost per link click)",
};
type SortKey = MetricKey | "name" | "status" | "delivery" | "budget" | "ends";

// A column's normal width just fits its full name, on at most two lines as
// in Ads Manager, plus the sort arrows and the ▾. Some columns need room for
// what's in them ("Using ad set budget").
const HEAD_EXTRA = 20 + 6 + 18 + 32 + 4;
const CONTENT_MIN: Partial<Record<ColId, number>> = { delivery: 130, budget: 150, ends: 110 };
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(t: string): number {
  if (measureCtx === undefined) {
    try { measureCtx = document.createElement("canvas").getContext("2d"); } catch { measureCtx = null; }
    if (measureCtx) measureCtx.font = `600 14px ${FB_FONT}`;
  }
  return measureCtx ? measureCtx.measureText(t).width : t.length * 8;
}
function fitWidth(label: string): number {
  const words = label.split(" ");
  let best = textWidth(label);
  for (let i = 1; i < words.length; i++) {
    best = Math.min(best, Math.max(textWidth(words.slice(0, i).join(" ")), textWidth(words.slice(i).join(" "))));
  }
  return Math.ceil(best + HEAD_EXTRA);
}
const headLabel = (id: ColId) => SHORT_LABEL[id] ?? COLUMN_LABEL[id];
const defaultWidth = (id: ColId | "name", level: AdsLevel) =>
  id === "name" ? (level === "ad" ? 380 : 320) : Math.max(fitWidth(headLabel(id)), CONTENT_MIN[id] ?? 90);

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
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "spend", dir: -1 });
  const [headMenu, setHeadMenu] = useState<{ el: HTMLElement; col: ColId | "name"; key: SortKey } | null>(null);
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
    ? { level: "campaign", campaignIds: [], adsetIds: [] }
    : view.level === "adset" ? { level: "adset", campaignIds: view.campaignIds, adsetIds: [] } : view;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["adsTable", adAccountId, since, until, fetchView.level, fetchView.campaignIds.join(","), fetchView.adsetIds.join(",")],
    queryFn: () => getAdsTable(adAccountId!, since, until, fetchView),
    enabled: !!adAccountId,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const rows = (data?.rows ?? []).map((r) => ({ r, v: metricValues(r) }));
  const sortVal = (x: { r: AdsRow; v: ReturnType<typeof metricValues> }): number | string => {
    const k = sort.k;
    if (k === "name") return x.r.name.toLowerCase();
    if (k === "status") return x.r.status === "ACTIVE" ? 1 : 0;
    if (k === "delivery") return DELIVERY[x.r.delivery]?.label ?? x.r.delivery;
    if (k === "budget") return x.r.dailyBudget ?? x.r.lifetimeBudget ?? -Infinity;
    if (k === "ends") return x.r.ends ? Date.parse(x.r.ends) : Infinity;
    return x.v[k] ?? -Infinity;
  };
  rows.sort((a, b) => { const x = sortVal(a), y = sortVal(b); return (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir; });
  // Reach and frequency can't be added up (people repeat across rows); only
  // the account totals have them right.
  const summed = sumRows(rows.map((x) => x.r));
  const totals = view.level === "campaign" && data?.account ? { ...data.account, booked: summed.booked, mandates: summed.mandates } : summed;
  const totalV = metricValues(totals);
  const word = LEVEL_WORD[view.level];
  const onSortRaw = (k: SortKey) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" || k === "delivery" ? 1 : -1 }));
  const clickable = view.level !== "ad";
  // Ticked rows. Ticked campaigns or ad sets narrow the next tab ("2 selected").
  const [adTicked, setAdTicked] = useState<string[]>([]);
  const ticked = view.level === "campaign" ? view.campaignIds : view.level === "adset" ? view.adsetIds : adTicked;
  const setTicked = (next: string[]) => {
    if (view.level === "campaign") onView({ level: "campaign", campaignIds: next, adsetIds: [] });
    else if (view.level === "adset") onView({ level: "adset", campaignIds: view.campaignIds, adsetIds: next });
    else setAdTicked(next);
  };
  const toggleSelect = (r: AdsRow) => setTicked(ticked.includes(r.id) ? ticked.filter((x) => x !== r.id) : [...ticked, r.id]);
  const allTicked = rows.length > 0 && rows.every((x) => ticked.includes(x.r.id));
  const someTicked = rows.some((x) => ticked.includes(x.r.id));
  const toggleAll = () => setTicked(someTicked ? [] : rows.map((x) => x.r.id));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const open = (r: AdsRow) => {
    if (view.level === "campaign") onView({ level: "adset", campaignIds: [r.id], adsetIds: [] });
    else if (view.level === "adset") onView({ level: "ad", campaignIds: view.campaignIds.length ? view.campaignIds : r.campaign?.id ? [r.campaign.id] : [], adsetIds: [r.id] });
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
  const tabs: { level: AdsLevel; icon: (on: boolean) => ReactNode; label: string; count: number; clear?: () => void }[] = [
    {
      level: "campaign",
      icon: (on) => (on ? <FolderIcon sx={{ fontSize: 22 }} /> : <FolderOutlinedIcon sx={{ fontSize: 22 }} />),
      label: "Campaigns",
      count: view.campaignIds.length,
      clear: () => onView({ level: view.level, campaignIds: [], adsetIds: [] }),
    },
    {
      level: "adset",
      icon: (on) => (on ? <GridFilledIcon /> : <GridViewOutlinedIcon sx={{ fontSize: 22 }} />),
      label: !view.adsetIds.length && view.campaignIds.length ? `Ad sets for ${plural(view.campaignIds.length, "Campaign")}` : "Ad sets",
      count: view.adsetIds.length,
      clear: () => onView({ level: view.level, campaignIds: view.campaignIds, adsetIds: [] }),
    },
    { level: "ad", icon: (on) => (on ? <AdFilledIcon /> : <WebAssetOutlinedIcon sx={{ fontSize: 22 }} />), label: view.adsetIds.length ? `Ads for ${plural(view.adsetIds.length, "Ad set")}` : view.campaignIds.length ? `Ads for ${plural(view.campaignIds.length, "Campaign")}` : "Ads", count: 0 },
  ];
  // Moving between tabs keeps what's selected, as in Ads Manager.
  const pickTab = (l: AdsLevel) => onView({ level: l, campaignIds: view.campaignIds, adsetIds: view.adsetIds });

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
  const headCell = { bgcolor: FB.head, color: FB.text, fontFamily: FB_FONT, fontSize: 14, fontWeight: 600, py: 0.75, px: 1.25, height: 52, overflow: "hidden", borderRight: `1px solid ${FB.line}`, borderBottom: `1px solid ${FB.line}`, borderTop: `1px solid ${FB.line}`, lineHeight: 1.3, verticalAlign: "middle", position: "relative", textAlign: "left" } as const;
  // A header as in Ads Manager: the name, ⇅ to sort (↓/↑ in blue when sorted), ▾ for the column's menu.
  const head = (label: string, key: SortKey, col: ColId | "name" | null, tip?: string) => {
    const active = sort.k === key;
    return (
      <Box sx={{ display: "flex", alignItems: "stretch", mx: -1.25, my: -0.75, height: 52, minWidth: 0, "&:hover": { bgcolor: "#f2f2f2" } }}>
        <Tooltip title={tip ?? ""} disableHoverListener={!tip}>
          <ButtonBase
            disableRipple
            onClick={() => onSort(key)}
            aria-label={`Sort by ${label}`}
            sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 0.75, minWidth: 0, px: 1.25, textAlign: "left", font: "inherit", color: active ? FB.link : "inherit", "&.Mui-focusVisible": { outline: `2px solid ${FB.blue}`, outlineOffset: -2 } }}
          >
            <Box component="span" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{label}</Box>
            {active
              ? (sort.dir === -1 ? <ArrowDownwardIcon sx={{ fontSize: 17, flex: "none" }} /> : <ArrowUpwardIcon sx={{ fontSize: 17, flex: "none" }} />)
              : <SwapVertIcon sx={{ fontSize: 18, flex: "none", color: FB.text }} />}
          </ButtonBase>
        </Tooltip>
        {col && (
          <IconButton size="small" aria-label={`${label} column options`} onClick={(e) => setHeadMenu({ el: e.currentTarget, col, key })} sx={{ alignSelf: "center", mx: 0.5, p: 0.25, color: FB.text, flex: "none", borderRadius: "4px", "&:hover": { bgcolor: "transparent" } }}>
            <ArrowDropDownIcon sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>
    );
  };
  const nameW = width("name");
  const sortName = (k: SortKey) => (k === "name" ? word.title : k === "status" ? "Off / On" : headLabel(k as ColId));
  const onSort = (k: SortKey) => {
    const dir = sort.k === k ? sort.dir * -1 : k === "name" || k === "delivery" ? 1 : -1;
    onSortRaw(k);
    showSnack(`Sorted by ${sortName(k)}, ${dir === 1 ? "lowest first" : "highest first"}`);
  };
  const actUrl = adAccountId ? adAccountId.replace(/^act_/, "") : "";
  const fbBtn = {
    textTransform: "none", letterSpacing: 0, fontFamily: FB_FONT, fontSize: 15, fontWeight: 500, color: FB.text, bgcolor: "#fff",
    border: `1px solid ${FB.btnLine}`, borderRadius: "6px", height: 36, minHeight: 36, px: 1.5, whiteSpace: "nowrap",
    "& .MuiButton-startIcon": { mr: 0.75 }, "& .MuiButton-endIcon": { ml: 0.5 },
    "&:hover": { bgcolor: "#f2f2f2" }, "&.Mui-disabled": { color: "#bcc0c4", borderColor: "#e4e6eb" },
  } as const;
  // Ads Manager's Export: the table as it is, columns and all.
  const exportCsv = () => {
    const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
    const lines = [[word.title, "Off / On", ...colIds.map((c) => COLUMN_LABEL[c])].map(q).join(",")];
    for (const { r, v } of rows) {
      lines.push([r.name, r.status === "ACTIVE" ? "On" : "Off", ...colIds.map((c) => {
        if (c === "delivery") return DELIVERY[r.delivery]?.label ?? r.delivery;
        if (c === "budget") return r.dailyBudget ? `${r.dailyBudget} daily` : r.lifetimeBudget ? `${r.lifetimeBudget} lifetime` : "";
        if (c === "ends") return r.ends ? fbDate(r.ends) : "Ongoing";
        const n = v[c];
        return n === null || n === undefined ? "" : String(Math.round(n * 100) / 100);
      })].map((x) => q(String(x))).join(","));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `${word.many.replace(" ", "-")}-${since}-to-${until}.csv`;
    a.click();
    showSnack(`Downloaded ${a.download}`);
    URL.revokeObjectURL(a.href);
  };
  const hideColumn = (c: ColId) => {
    const before = prefs;
    setPrefs({ ...prefs, choice: "custom", custom: visibleColumns(prefs, "campaign").filter((x) => x !== c) });
    showSnack(`${COLUMN_LABEL[c]} hidden`, () => setPrefs(before));
  };

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
                flex: "0 1 288px", minWidth: 0, justifyContent: "flex-start", gap: 1.25, px: 2, height: 44,
                bgcolor: on ? "#fff" : FB.tabOff, color: on ? FB.link : FB.text, fontSize: 16, fontWeight: 600, fontFamily: FB_FONT,
                border: `1px solid ${FB.line}`, borderBottom: on ? "1px solid #fff" : `1px solid ${FB.line}`, borderRadius: "6px 6px 0 0",
                mb: "-1px", position: "relative", zIndex: on ? 2 : 1,
                "&:hover": { bgcolor: on ? "#fff" : "#e4e6eb" },
                "&.Mui-focusVisible": { outline: `2px solid ${FB.blue}`, outlineOffset: -2 },
              }}
            >
              <Box sx={{ color: on ? FB.blue : FB.text, display: "flex", flex: "none" }}>{t.icon(on)}</Box>
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto" }}>{t.label}</Box>
              {t.count > 0 && t.clear && (
                <Box
                  component="span"
                  sx={{ ml: "auto", flex: "none", display: "inline-flex", alignItems: "center", gap: 0.75, bgcolor: FB.pill, color: "#fff", borderRadius: "4px", pl: 1, pr: 0.5, height: 24, fontSize: 14, fontWeight: 500 }}
                >
                  {t.count} selected
                  <IconButton
                    size="small"
                    aria-label={`Clear the selected ${t.level === "campaign" ? "campaign" : "ad set"}`}
                    onClick={(e) => { e.stopPropagation(); t.clear!(); }}
                    sx={{ color: "#fff", p: 0, "&:hover": { bgcolor: "rgba(255,255,255,0.18)" } }}
                  >
                    <CloseIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Box>
              )}
            </ButtonBase>
          );
        })}
      </Box>

      <Box sx={{ bgcolor: "#fff", border: `1px solid ${FB.line}`, borderRadius: "0 8px 8px 8px", overflow: "hidden", position: "relative", zIndex: 1 }}>
        {/* Toolbar: the column chooser, as in Ads Manager. */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.25, flexWrap: "wrap" }}>
          <Button
            component="a"
            href={actUrl ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actUrl}&nav_source=no_referrer#` : undefined}
            target="_blank"
            rel="noopener"
            startIcon={<AddIcon />}
            sx={{ ...fbBtn, bgcolor: FB.green, borderColor: FB.green, color: "#fff", "&:hover": { bgcolor: "#166b3a", borderColor: "#166b3a" } }}
          >
            Create
          </Button>
          <Tooltip title={ticked.length ? "Open what's ticked in Ads Manager" : `Tick a ${word.one} to edit it`}>
            <span>
              <Button
                component="a"
                disabled={!ticked.length || !actUrl}
                href={ticked.length && actUrl ? `https://adsmanager.facebook.com/adsmanager/manage/${view.level === "campaign" ? "campaigns" : view.level === "adset" ? "adsets" : "ads"}/edit?act=${actUrl}&selected_${view.level === "campaign" ? "campaign" : view.level === "adset" ? "adset" : "ad"}_ids=${ticked.join(",")}` : undefined}
                target="_blank"
                rel="noopener"
                startIcon={<EditOutlinedIcon />}
                sx={fbBtn}
              >
                Edit
              </Button>
            </span>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={(e) => setColMenu(e.currentTarget)}
            startIcon={<ViewWeekOutlinedIcon />}
            endIcon={<ArrowDropDownIcon />}
            aria-haspopup="menu"
            sx={fbBtn}
          >
            Columns: {choiceLabel(prefs)}
          </Button>
          <Tooltip title="Export (CSV)">
            <span>
              <Button onClick={exportCsv} disabled={!rows.length} aria-label="Export as a spreadsheet" sx={{ ...fbBtn, minWidth: 44, px: 1.25 }}>
                <FileDownloadOutlinedIcon sx={{ fontSize: 20 }} />
              </Button>
            </span>
          </Tooltip>
          <Menu anchorEl={colMenu} open={!!colMenu} onClose={() => setColMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ paper: { sx: { minWidth: 300 } } }}>
            <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontWeight: 700, fontSize: 15 }}>Columns: {choiceLabel(prefs)}</Typography>
            <MenuItem onClick={() => { setColMenu(null); setCustomizing(visibleColumns(prefs, "campaign")); }}>
              <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Customize columns</ListItemText>
            </MenuItem>
            <Divider />
            <Typography sx={{ px: 2, pt: 0.5, pb: 0.5, fontWeight: 700, fontSize: 14 }}>Presets</Typography>
            {(["performance_clicks", "performance", "estatekit"] as PresetKey[]).map((k) => (
              <MenuItem key={k} selected={prefs.choice === k} sx={PICKED} onClick={() => { setPrefs({ ...prefs, choice: k }); setColMenu(null); if (prefs.choice !== k) showSnack(`Showing ${PRESETS[k].label} columns`); }}>
                <ListItemIcon><Radio size="small" checked={prefs.choice === k} sx={{ p: 0 }} tabIndex={-1} /></ListItemIcon>
                <ListItemText>{PRESETS[k].label}</ListItemText>
              </MenuItem>
            ))}
            {prefs.choice === "custom" || prefs.custom.length ? (
              <MenuItem selected={prefs.choice === "custom"} sx={PICKED} onClick={() => { setPrefs({ ...prefs, choice: "custom" }); setColMenu(null); if (prefs.choice !== "custom") showSnack("Showing your own columns"); }}>
                <ListItemIcon><Radio size="small" checked={prefs.choice === "custom"} sx={{ p: 0 }} tabIndex={-1} /></ListItemIcon>
                <ListItemText>Custom</ListItemText>
              </MenuItem>
            ) : null}
            <Divider />
            <MenuItem onClick={() => { setPrefs({ ...prefs, tint: !prefs.tint }); showSnack(prefs.tint ? "Colours off" : "Colours on: green on target, yellow close, red off"); }}>
              <ListItemIcon><FormatColorFillIcon fontSize="small" /></ListItemIcon>
              <ListItemText secondary="Colour against the targets">Conditional formatting</ListItemText>
              <Checkbox size="small" checked={prefs.tint} tabIndex={-1} sx={{ p: 0, ml: 1 }} />
            </MenuItem>
            <MenuItem onClick={() => { setPrefs({ ...prefs, widths: {} }); setColMenu(null); showSnack("Column widths reset"); }}>
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
            <Box sx={{ overflow: "auto", maxHeight: 640, ...THIN_SCROLL }}>
              <Table size="small" stickyHeader sx={{ tableLayout: "fixed", width: "max-content", borderCollapse: "separate", "& td": { borderBottom: 0, fontFamily: FB_FONT, fontSize: 14, color: FB.text, px: 1.25, py: 1.25, lineHeight: 1.35, verticalAlign: "top", overflow: "hidden" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="none" sx={{ ...headCell, ...stickyLeft(0, 48), zIndex: 3, textAlign: "center", px: "0 !important" }}>
                      <Checkbox
                        size="small"
                        checked={allTicked}
                        indeterminate={someTicked && !allTicked}
                        onChange={toggleAll}
                        sx={FB_CHECK} {...CHECK_ICONS}
                        slotProps={{ input: { "aria-label": someTicked ? "Untick all" : "Tick all" } }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...headCell, ...stickyLeft(48, 80), zIndex: 3 }}>{head("Off / On", "status", null, "Turn it on or off. Off stops it showing and spending straight away.")}</TableCell>
                    <TableCell sx={{ ...headCell, ...stickyLeft(128, nameW), zIndex: 3 }}>
                      {head(word.title, "name", "name")}
                      {resizer("name")}
                    </TableCell>
                    {colIds.map((id) => {
                      const m = metricOf(id);
                      const w = width(id);
                      return (
                        <TableCell key={id} sx={{ ...headCell, width: w, minWidth: w, maxWidth: w }}>
                          {head(headLabel(id), m ? m.key : id, id, m ? (m.target ? `${m.help} Target: ${m.target}.` : m.help) : COL_HELP[id])}
                          {resizer(id)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(({ r, v }, i) => {
                    const sel = ticked.includes(r.id);
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
                          "&:focus-visible": { outline: `2px solid ${FB.blue}`, outlineOffset: -2 },
                          "&:hover .ek-name": { textDecoration: "underline" },
                          "&:hover .ek-ext": { opacity: 1 },
                        }}
                      >
                        <TableCell padding="none" sx={{ ...stickyLeft(0, 48), textAlign: "center", px: "0 !important", pt: "6px !important" }}>
                          <Checkbox
                            size="small"
                            checked={sel}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelect(r)}
                            sx={FB_CHECK} {...CHECK_ICONS}
                            slotProps={{ input: { "aria-label": `Select ${r.name}` } }}
                          />
                        </TableCell>
                        <TableCell sx={{ ...stickyLeft(48, 80), py: "8px !important", textAlign: "center" }}>
                          <Tooltip title={r.status === "ACTIVE" ? `Turn this ${word.one} off` : `Turn this ${word.one} on`}>
                            <Switch
                              checked={r.status === "ACTIVE"}
                              disabled={busy === r.id}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setConfirm({ row: r, on: e.target.checked })}
                              slotProps={{ input: { "aria-label": `${r.name}: ${r.status === "ACTIVE" ? "on" : "off"}` } }}
                              sx={FB_SWITCH}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ ...stickyLeft(128, nameW), borderRight: `1px solid ${FB.line}` }}>
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
                              <Box className="ek-name" sx={{ flex: 1, minWidth: 0, color: clickable ? FB.link : FB.text, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pt: view.level === "ad" ? 0.75 : 0 }}>{r.name}</Box>
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
                            <TableCell key={id} align={LEFT_COLS.has(id) ? "left" : "right"} sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textOverflow: "ellipsis", ...(tone ? { bgcolor: `${tone} !important` } : {}) }}>
                              {cell(id, r, v)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ position: "sticky", bottom: 0, zIndex: 2, "& > td": { bgcolor: "#fff", borderTop: `1px solid ${FB.line}`, fontWeight: 400, whiteSpace: "nowrap" } }}>
                    <TableCell sx={{ ...stickyLeft(0, 48) }} />
                    <TableCell sx={{ ...stickyLeft(48, 80) }} />
                    <TableCell sx={{ ...stickyLeft(128, nameW), borderRight: `1px solid ${FB.line}` }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        Results from {rows.length} {rows.length === 1 ? word.one : word.many}
                        <Tooltip title="Excludes deleted items"><InfoIcon sx={{ fontSize: 15, color: FB.text }} /></Tooltip>
                      </Box>
                    </TableCell>
                    {colIds.map((id) => {
                      const m = metricOf(id);
                      return (
                        <TableCell key={id} align={LEFT_COLS.has(id) ? "left" : "right"} sx={{ fontVariantNumeric: "tabular-nums" }}>
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

      <Menu anchorEl={headMenu?.el} open={!!headMenu} onClose={() => setHeadMenu(null)}>
        <MenuItem onClick={() => { if (headMenu) setSort({ k: headMenu.key, dir: 1 }); setHeadMenu(null); }}>
          <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon><ListItemText>Sort ascending</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (headMenu) setSort({ k: headMenu.key, dir: -1 }); setHeadMenu(null); }}>
          <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon><ListItemText>Sort descending</ListItemText>
        </MenuItem>
        {headMenu && headMenu.col !== "name" && (
          <MenuItem onClick={() => { hideColumn(headMenu.col as ColId); setHeadMenu(null); }}>
            <ListItemIcon><VisibilityOffOutlinedIcon fontSize="small" /></ListItemIcon><ListItemText>Hide column</ListItemText>
          </MenuItem>
        )}
        {headMenu && (
          <MenuItem onClick={() => { const w = { ...prefs.widths }; delete w[headMenu.col]; setPrefs({ ...prefs, widths: w }); setHeadMenu(null); showSnack("Column width reset"); }}>
            <ListItemIcon><RestartAltIcon fontSize="small" /></ListItemIcon><ListItemText>Reset column width</ListItemText>
          </MenuItem>
        )}
      </Menu>

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
          <Button variant="contained" disabled={!customizing?.length} onClick={() => { setPrefs({ ...prefs, choice: "custom", custom: customizing! }); setCustomizing(null); showSnack("Your columns are saved"); }}>Apply</Button>
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
