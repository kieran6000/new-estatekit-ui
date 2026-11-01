import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Popper, Skeleton, Switch, Table, TableBody, TableCell,
  TableHead, TableRow, TableSortLabel, Tooltip, Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import FlagIcon from "@mui/icons-material/Flag";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import CropLandscapeOutlinedIcon from "@mui/icons-material/CropLandscapeOutlined";
import { getAdsTable, setAdStatus, type AdsLevel, type AdsRow } from "../api/agentProfile";
import { METRICS, adsMoney, formatMetric, metricValues, sumRows, toneOf, type MetricDef, type MetricKey, type Tone } from "../lib/adTargets";
import { useSnack } from "../hooks/useSnack";

// The client page's ads table, made to look and work like Ads Manager:
// Campaigns / Ad sets / Ads tabs, an Off/On switch per row, Facebook's own
// columns in Facebook's order with the small grey label under each number,
// and click-through (a campaign opens its ad sets, an ad set its ads).
// Hover an ad's picture for its preview. Cells are tinted against the media
// buyer's targets (lib/adTargets). Where you are lives in the address.

export interface AdsView { level: AdsLevel; campaignId: string | null; adsetId: string | null }

// Ads Manager's colours.
const FB = { text: "#1c2b33", sub: "#65676b", line: "#dddfe2", head: "#ffffff", zebra: "#f5f6f7", hover: "#e9eef6", link: "#0a66c2", blue: "#0866ff", tabOff: "#f0f2f5" };
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["adsTable", adAccountId, since, until, view.level, view.campaignId, view.adsetId],
    queryFn: () => getAdsTable(adAccountId!, since, until, view),
    enabled: !!adAccountId,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const rows = (data?.rows ?? []).map((r) => ({ r, v: metricValues(r) }));
  rows.sort((a, b) => (sort.k === "name" ? a.r.name.localeCompare(b.r.name) * sort.dir : ((a.v[sort.k] ?? -Infinity) - (b.v[sort.k] ?? -Infinity)) * sort.dir));
  const top = view.level === "campaign" && !view.campaignId;
  // Reach and frequency can't be added up (people repeat across rows); only
  // the account totals have them right.
  const totals = top && data?.account ? data.account : sumRows(rows.map((x) => x.r));
  const totalV = metricValues(totals);
  const word = LEVEL_WORD[view.level];
  const onSort = (k: MetricKey | "name") => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));

  // Where you are, named from the rows' parents.
  const campaignName = view.campaignId ? data?.rows.find((r) => r.campaign?.id === view.campaignId)?.campaign?.name ?? "1 campaign" : null;
  const adsetName = view.adsetId ? data?.rows.find((r) => r.adset?.id === view.adsetId)?.adset?.name ?? "1 ad set" : null;
  const clickable = view.level !== "ad";
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

  // ── Tabs, as Ads Manager draws them: folder tabs, the open one white ──
  const tabs: { level: AdsLevel; icon: ReactNode; label: string; chip?: string }[] = [
    { level: "campaign", icon: <Box sx={{ width: 22, height: 22, borderRadius: "4px", bgcolor: FB.blue, color: "#fff", display: "grid", placeItems: "center" }}><FlagIcon sx={{ fontSize: 14 }} /></Box>, label: "Campaigns" },
    { level: "adset", icon: <GridViewOutlinedIcon sx={{ fontSize: 22 }} />, label: campaignName ? "Ad sets for 1 Campaign" : "Ad sets" },
    { level: "ad", icon: <CropLandscapeOutlinedIcon sx={{ fontSize: 22 }} />, label: adsetName ? "Ads for 1 Ad set" : campaignName ? "Ads for 1 Campaign" : "Ads" },
  ];
  const pickTab = (l: AdsLevel) => onView({ level: l, campaignId: l === "campaign" ? null : view.campaignId, adsetId: l === "ad" ? view.adsetId : null });

  // ── Columns, in Ads Manager's order ──
  type Col = { id: string; label: string; metric?: MetricDef; align: "left" | "right"; minW: number };
  const metric = (k: MetricKey) => METRICS.find((m) => m.key === k)!;
  const cols: Col[] = [
    { id: "delivery", label: "Delivery", align: "left", minW: 150 },
    ...(["leads", "reach", "freq", "cpl"] as MetricKey[]).map((k) => ({ id: k, label: metric(k).label, metric: metric(k), align: "right" as const, minW: 120 })),
    ...(view.level !== "ad" ? [{ id: "budget", label: "Budget", align: "right" as const, minW: 150 }] : []),
    { id: "spend", label: "Amount spent", metric: metric("spend"), align: "right", minW: 120 },
    ...(view.level !== "ad" ? [{ id: "ends", label: "Ends", align: "right" as const, minW: 110 }] : []),
    ...(["impressions", "cpm", "clicks", "ctr", "lpv"] as MetricKey[]).map((k) => ({ id: k, label: metric(k).label, metric: metric(k), align: "right" as const, minW: k === "cpm" || k === "ctr" ? 190 : 120 })),
  ];

  const cell = (c: Col, r: AdsRow, v: ReturnType<typeof metricValues>) => {
    if (c.id === "delivery") {
      const d = DELIVERY[r.delivery] ?? { label: r.delivery.toLowerCase().replace(/_/g, " "), color: "#bec3c9" };
      return <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}><Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: d.color, flex: "none" }} />{d.label}</Box>;
    }
    if (c.id === "budget") {
      if (r.dailyBudget) return <Num v={adsMoney(r.dailyBudget)} sub="Daily" />;
      if (r.lifetimeBudget) return <Num v={adsMoney(r.lifetimeBudget)} sub="Lifetime" />;
      return <Box sx={{ color: FB.text, whiteSpace: "nowrap" }}>{view.level === "campaign" ? "Using ad set budget" : "Using campaign budget"}</Box>;
    }
    if (c.id === "ends") return <Box sx={{ color: FB.text }}>{r.ends ? fbDate(r.ends) : "Ongoing"}</Box>;
    const k = c.metric!.key;
    const sub = k === "leads" ? (r.leads ? r.resultType || "Leads" : "") : k === "cpl" ? (r.leads ? perResult(r.resultType || "Leads") : "") : undefined;
    return <Num v={formatMetric(k, v[k])} sub={sub} />;
  };

  const nameW = view.level === "ad" ? 380 : 320;
  const stickyLeft = (left: number, w: number) => ({ position: "sticky", left, zIndex: 1, minWidth: w, maxWidth: w, width: w } as const);
  const headCell = { bgcolor: FB.head, color: FB.text, fontSize: 13, fontWeight: 600, py: 1, px: 1.25, whiteSpace: "nowrap", borderRight: `1px solid ${FB.line}`, borderBottom: `1px solid ${FB.line}`, lineHeight: 1.25, verticalAlign: "middle" } as const;

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* Folder tabs */}
      <Box role="tablist" aria-label="Campaigns, ad sets and ads" sx={{ display: "flex", gap: 0.75, alignItems: "flex-end", px: 0.5 }}>
        {tabs.map((t) => {
          const on = view.level === t.level;
          return (
            <ButtonBase
              key={t.level}
              role="tab"
              aria-selected={on}
              onClick={() => pickTab(t.level)}
              sx={{
                flex: "0 1 300px", minWidth: 0, justifyContent: "flex-start", gap: 1.25, px: 2, height: on ? 48 : 44,
                bgcolor: on ? "#fff" : FB.tabOff, color: on ? FB.link : FB.text, fontSize: 15, fontWeight: 600,
                border: `1px solid ${FB.line}`, borderBottom: on ? "1px solid #fff" : `1px solid ${FB.line}`, borderRadius: "8px 8px 0 0",
                mb: "-1px", position: "relative", zIndex: on ? 2 : 1,
                "&:hover": { bgcolor: on ? "#fff" : "#e4e6eb" },
                "&.Mui-focusVisible": { outline: `2px solid ${FB.blue}`, outlineOffset: -2 },
              }}
            >
              <Box sx={{ color: on ? FB.blue : FB.sub, display: "flex", flex: "none" }}>{t.icon}</Box>
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</Box>
            </ButtonBase>
          );
        })}
      </Box>

      <Box sx={{ bgcolor: "#fff", border: `1px solid ${FB.line}`, borderRadius: "0 8px 8px 8px", overflow: "hidden", position: "relative", zIndex: 1 }}>
        {(campaignName || adsetName) && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.75, borderBottom: `1px solid ${FB.line}`, flexWrap: "wrap", minWidth: 0, fontSize: 13 }}>
            <Button size="small" onClick={() => pickTab("campaign")} sx={{ textTransform: "none", minWidth: 0, color: FB.link }}>All campaigns</Button>
            {campaignName && (
              <>
                <ChevronRightIcon sx={{ fontSize: 18, color: FB.sub }} />
                <Button size="small" disabled={!adsetName} onClick={() => onView({ level: "adset", campaignId: view.campaignId, adsetId: null })} sx={{ textTransform: "none", minWidth: 0, maxWidth: 360, color: FB.link, "&.Mui-disabled": { color: FB.text, fontWeight: 600 } }}>
                  <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{campaignName}</Box>
                </Button>
              </>
            )}
            {adsetName && (
              <>
                <ChevronRightIcon sx={{ fontSize: 18, color: FB.sub }} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, px: 0.5, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: FB.text }}>{adsetName}</Typography>
              </>
            )}
          </Box>
        )}

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
              <Table size="small" stickyHeader sx={{ borderCollapse: "separate", "& td": { borderBottom: 0, fontSize: 13.5, px: 1.25, py: 0.9, verticalAlign: "top" } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...headCell, ...stickyLeft(0, 72), zIndex: 3 }}>Off / On</TableCell>
                    <TableCell sx={{ ...headCell, ...stickyLeft(72, nameW), zIndex: 3 }}>
                      <TableSortLabel active={sort.k === "name"} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort("name")}>{word.title}</TableSortLabel>
                    </TableCell>
                    {cols.map((c) => (
                      <TableCell key={c.id} align={c.align} sx={{ ...headCell, minWidth: c.minW }}>
                        {c.metric ? (
                          <Tooltip title={c.metric.target ? `Target: ${c.metric.target}` : ""} disableHoverListener={!c.metric.target}>
                            <TableSortLabel active={sort.k === c.metric.key} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort(c.metric!.key)}>{c.label}</TableSortLabel>
                          </Tooltip>
                        ) : c.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(({ r, v }, i) => {
                    const bg = i % 2 ? FB.zebra : "#fff";
                    return (
                      <TableRow
                        key={r.id}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? () => open(r) : undefined}
                        onKeyDown={clickable ? (e) => { if (e.key === "Enter") { e.preventDefault(); open(r); } } : undefined}
                        sx={{
                          cursor: clickable ? "pointer" : "default",
                          opacity: busy === r.id ? 0.5 : 1,
                          "& > td": { bgcolor: bg },
                          "&:hover > td": { bgcolor: FB.hover },
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
                              sx={{
                                width: 52, height: 30, p: 0.75,
                                // Off: a light pill with a dark knob. On: blue with a white knob.
                                "& .MuiSwitch-switchBase": { p: "7px", color: FB.text },
                                "& .MuiSwitch-thumb": { width: 16, height: 16, boxShadow: "none" },
                                "& .MuiSwitch-switchBase.Mui-checked": { color: "#fff" },
                                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: FB.blue, border: `1px solid ${FB.blue}`, opacity: 1 },
                                "& .MuiSwitch-track": { borderRadius: 10, bgcolor: "#fff", border: "1px solid #bcc0c4", opacity: 1 },
                              }}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ ...stickyLeft(72, nameW), borderRight: `1px solid ${FB.line}` }}>
                          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            {view.level === "ad" && (
                              <Box
                                onMouseEnter={(e) => { const el = e.currentTarget; clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setPreview({ el, row: r }), 200); }}
                                onMouseLeave={() => { clearTimeout(hoverTimer.current); setPreview(null); }}
                                sx={{ width: 36, height: 36, flex: "none", borderRadius: "4px", overflow: "hidden", bgcolor: FB.tabOff, display: "grid", placeItems: "center", cursor: "zoom-in", border: `1px solid ${FB.line}` }}
                              >
                                {r.creative?.image ? <Box component="img" src={r.creative.image} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageOutlinedIcon sx={{ fontSize: 18, color: FB.sub }} />}
                              </Box>
                            )}
                            <Tooltip title={r.created ? `Created ${fbDate(r.created)}` : ""} placement="top-start" disableHoverListener={!r.created}>
                              <Box className="ek-name" sx={{ flex: 1, minWidth: 0, color: clickable ? FB.link : FB.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pt: view.level === "ad" ? 0.75 : 0 }}>{r.name}</Box>
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
                        {cols.map((c) => (
                          <TableCell
                            key={c.id}
                            align={c.align}
                            sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...(c.metric ? { bgcolor: `${TONE_BG[toneOf(c.metric, v[c.metric.key], r)] ?? bg} !important` } : {}) }}
                          >
                            {cell(c, r, v)}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ position: "sticky", bottom: 0, zIndex: 2, "& > td": { bgcolor: "#fff", borderTop: `1px solid ${FB.line}`, fontWeight: 600, whiteSpace: "nowrap" } }}>
                    <TableCell sx={{ ...stickyLeft(0, 72) }} />
                    <TableCell sx={{ ...stickyLeft(72, nameW), borderRight: `1px solid ${FB.line}` }}>
                      <Num v={`Results from ${rows.length} ${rows.length === 1 ? word.one : word.many}`} sub="Excludes deleted items" />
                    </TableCell>
                    {cols.map((c) => (
                      <TableCell key={c.id} align={c.align} sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {c.metric ? <Num v={formatMetric(c.metric.key, totalV[c.metric.key])} sub={c.metric.key === "spend" ? "Total spent" : c.metric.key === "leads" ? "Total" : c.metric.key === "cpl" ? "Per result" : c.metric.key === "reach" && totalV.reach !== null ? "Accounts Center accounts" : undefined} /> : null}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", p: "8px 12px", fontSize: 12, color: FB.sub, borderTop: `1px solid ${FB.line}` }}>
              {(["good", "near", "bad"] as const).map((t) => (
                <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ width: 12, height: 12, bgcolor: TONE_BG[t], border: `1px solid ${FB.line}` }} />
                  {t === "good" ? "On target" : t === "near" ? "Close (within 20%)" : "Off target"}
                </Box>
              ))}
              <span>Targets: hover a column name. No colour under R150 spent or fewer than 3 results.</span>
            </Box>
          </>
        )}
      </Box>

      {/* The ad as it shows on Facebook. */}
      <Popper open={!!preview} anchorEl={preview?.el} placement="right-start" sx={{ zIndex: 1500, pointerEvents: "none" }} modifiers={[{ name: "offset", options: { offset: [0, 12] } }, { name: "preventOverflow", options: { padding: 12 } }]}>
        {preview?.row.creative && <AdPreview c={preview.row.creative} pageName={pageName} pageAvatar={pageAvatar} />}
      </Popper>

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
    <Paper elevation={8} sx={{ width: 320, borderRadius: "10px", overflow: "hidden", fontFamily: "Helvetica, Arial, sans-serif", color: "#1c1e21" }}>
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
