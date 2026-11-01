import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Popper, Skeleton, Switch, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, TableSortLabel, Tabs, Tooltip, Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { tokens } from "../theme";
import { getAdsTable, setAdStatus, type AdsLevel, type AdsRow } from "../api/agentProfile";
import { METRICS, formatMetric, metricValues, sumRows, toneOf, type MetricKey, type Tone } from "../lib/adTargets";
import { timeAgo } from "../lib/timeAgo";
import { useSnack } from "../hooks/useSnack";

// The client page's ads table, like Ads Manager: Campaigns, Ad sets and Ads
// tabs, Facebook's own columns (lib/adTargets) coloured against the media
// buyer's targets, an on/off switch per row, and click-through: a campaign
// opens its ad sets, an ad set its ads. Hover an ad for its preview. What
// you're looking at lives in the address (the client page passes `view`).

export interface AdsView { level: AdsLevel; campaignId: string | null; adsetId: string | null }

const TONE_BG: Record<Tone, string | undefined> = { good: "#edf7ee", near: "#fff8e1", bad: "#fdecea", none: undefined };
const NAME_W = 340;
const LEVEL_WORD: Record<AdsLevel, { one: string; many: string }> = {
  campaign: { one: "campaign", many: "Campaigns" },
  adset: { one: "ad set", many: "Ad sets" },
  ad: { one: "ad", many: "Ads" },
};

// Ads Manager's "Delivery" words.
const DELIVERY: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: "#188038" },
  PAUSED: { label: "Off", color: "#9aa0a6" },
  CAMPAIGN_PAUSED: { label: "Campaign off", color: "#9aa0a6" },
  ADSET_PAUSED: { label: "Ad set off", color: "#9aa0a6" },
  IN_PROCESS: { label: "In process", color: "#f9ab00" },
  PENDING_REVIEW: { label: "In review", color: "#f9ab00" },
  WITH_ISSUES: { label: "With issues", color: "#d93025" },
  DISAPPROVED: { label: "Rejected", color: "#d93025" },
};

const rand = (n: number) => "R" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function budget(r: AdsRow, level: AdsLevel): string {
  if (r.dailyBudget) return `${rand(r.dailyBudget)} Daily`;
  if (r.lifetimeBudget) return `${rand(r.lifetimeBudget)} Lifetime`;
  return level === "campaign" ? "Using ad set budget" : "Using campaign budget";
}
const ctaLabel = (cta: string) => (cta ? cta.toLowerCase().split("_").map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(" ") : "Learn more");
const domain = (link: string) => { try { return new URL(link).hostname.replace(/^www\./, "").toUpperCase(); } catch { return ""; } };

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

  const key = ["adsTable", adAccountId, since, until, view.level, view.campaignId, view.adsetId];
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => getAdsTable(adAccountId!, since, until, view),
    enabled: !!adAccountId,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const rows = (data?.rows ?? []).map((r) => ({ r, v: metricValues(r) }));
  rows.sort((a, b) => (sort.k === "name" ? a.r.name.localeCompare(b.r.name) * sort.dir : ((a.v[sort.k] ?? -Infinity) - (b.v[sort.k] ?? -Infinity)) * sort.dir));
  const top = view.level === "campaign" && !view.campaignId;
  // The totals row: added up, except reach and frequency, which only the
  // account totals have right (the same person is in several rows).
  const totals = top && data?.account ? data.account : sumRows(rows.map((x) => x.r));
  const totalV = metricValues(totals);
  const word = LEVEL_WORD[view.level];
  const onSort = (k: MetricKey | "name") => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));

  // Where you are: names come from the rows' parents.
  const campaignName = view.campaignId ? data?.rows.find((r) => r.campaign?.id === view.campaignId)?.campaign?.name ?? "This campaign" : null;
  const adsetName = view.adsetId ? data?.rows.find((r) => r.adset?.id === view.adsetId)?.adset?.name ?? "This ad set" : null;

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

  const stickyName = { position: "sticky", left: 0, zIndex: 1, bgcolor: "background.paper", minWidth: NAME_W, maxWidth: NAME_W, borderRight: `1px solid ${tokens.divider2}` } as const;
  const head = { fontSize: 12, fontWeight: 600, color: tokens.ink2, bgcolor: tokens.surface2, py: 1, verticalAlign: "bottom", whiteSpace: "nowrap" } as const;
  const clickable = view.level !== "ad";

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden" }}>
      <Tabs
        value={view.level}
        onChange={(_e, v: AdsLevel) => onView({ level: v, campaignId: v === "campaign" ? null : view.campaignId, adsetId: v === "ad" ? view.adsetId : null })}
        sx={{ px: 1, borderBottom: `1px solid ${tokens.divider}`, minHeight: 48, "& .MuiTab-root": { minHeight: 48, textTransform: "none", fontSize: 14 } }}
      >
        <Tab value="campaign" label="Campaigns" />
        <Tab value="adset" label={campaignName ? `Ad sets for 1 campaign` : "Ad sets"} />
        <Tab value="ad" label={adsetName ? "Ads for 1 ad set" : campaignName ? "Ads for 1 campaign" : "Ads"} />
      </Tabs>

      {(campaignName || adsetName) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 2, py: 1, borderBottom: `1px solid ${tokens.divider}`, bgcolor: tokens.surface2, flexWrap: "wrap", minWidth: 0 }}>
          <Button size="small" onClick={() => onView({ level: "campaign", campaignId: null, adsetId: null })} sx={{ textTransform: "none", minWidth: 0 }}>All campaigns</Button>
          {campaignName && (
            <>
              <ChevronRightIcon sx={{ fontSize: 18, color: tokens.ink3 }} />
              <Button size="small" disabled={!adsetName} onClick={() => onView({ level: "adset", campaignId: view.campaignId, adsetId: null })} sx={{ textTransform: "none", minWidth: 0, maxWidth: 320, "&.Mui-disabled": { color: tokens.ink, fontWeight: 600 } }}>
                <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{campaignName}</Box>
              </Button>
            </>
          )}
          {adsetName && (
            <>
              <ChevronRightIcon sx={{ fontSize: 18, color: tokens.ink3 }} />
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, px: 0.5, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{adsetName}</Typography>
            </>
          )}
        </Box>
      )}

      {!adAccountId ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>No ad account linked. Add it under Settings → Ads &amp; Facebook.</Typography>
      ) : isLoading ? (
        <Box sx={{ p: 2 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={56} />)}</Box>
      ) : isError || data?.note ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>
          {isError ? `Couldn't load the ${word.many.toLowerCase()}. Try again in a minute.` : data?.note === "busy" ? "Facebook is busy right now. Try again in a few minutes." : "Couldn't read this ad account from Meta. Check it's shared with EstateKit."}
        </Typography>
      ) : !rows.length ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>No {word.many.toLowerCase()} ran in these dates.</Typography>
      ) : (
        <>
          <Box sx={{ overflow: "auto", maxHeight: 640 }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1500, "& td, & th": { borderColor: tokens.divider2 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...head, ...stickyName, bgcolor: tokens.surface2, zIndex: 3 }}>
                    <TableSortLabel active={sort.k === "name"} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort("name")}>
                      Off / On · {word.many.replace(/s$/, "")} name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={head}>Delivery</TableCell>
                  {view.level !== "ad" && <TableCell sx={head}>Budget</TableCell>}
                  {METRICS.map((m) => (
                    <TableCell key={m.key} align="right" sx={head}>
                      <TableSortLabel active={sort.k === m.key} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort(m.key)}>
                        <Box sx={{ textAlign: "right" }}>
                          {m.label}
                          {m.target && <Box sx={{ fontSize: 11, fontWeight: 400, color: tokens.ink3 }}>Target: {m.target}</Box>}
                        </Box>
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(({ r, v }) => {
                  const d = DELIVERY[r.delivery] ?? { label: r.delivery.toLowerCase().replace(/_/g, " "), color: "#9aa0a6" };
                  return (
                    <TableRow
                      key={r.id}
                      hover
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => open(r) : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === "Enter") { e.preventDefault(); open(r); } } : undefined}
                      sx={{
                        cursor: clickable ? "pointer" : "default",
                        opacity: busy === r.id ? 0.5 : 1,
                        "&:hover > td": { boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0.035)" },
                        "&:focus-visible": { outline: `2px solid ${tokens.primary}`, outlineOffset: -2 },
                        "&:hover .ek-go": { opacity: 1, transform: "translateX(2px)" },
                        "&:hover .ek-ext": { opacity: 1 },
                      }}
                    >
                      <TableCell sx={{ ...stickyName, py: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                          <Tooltip title={r.status === "ACTIVE" ? `Turn this ${word.one} off` : `Turn this ${word.one} on`}>
                            <Switch
                              size="small"
                              checked={r.status === "ACTIVE"}
                              disabled={busy === r.id}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setConfirm({ row: r, on: e.target.checked })}
                              slotProps={{ input: { "aria-label": `${r.name}: ${r.status === "ACTIVE" ? "on" : "off"}` } }}
                            />
                          </Tooltip>
                          {view.level === "ad" && (
                            <Box
                              onMouseEnter={(e) => { const el = e.currentTarget; clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setPreview({ el, row: r }), 250); }}
                              onMouseLeave={() => { clearTimeout(hoverTimer.current); setPreview(null); }}
                              sx={{ width: 44, height: 44, flex: "none", borderRadius: "6px", overflow: "hidden", bgcolor: tokens.surface2, display: "grid", placeItems: "center", cursor: "zoom-in" }}
                            >
                              {r.creative?.image ? <Box component="img" src={r.creative.image} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageOutlinedIcon sx={{ color: tokens.ink3 }} />}
                            </Box>
                          )}
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: clickable ? tokens.primary : tokens.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</Typography>
                            {r.created && <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>Created {new Date(r.created).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} ({timeAgo(r.created)})</Typography>}
                          </Box>
                          {clickable ? (
                            <ChevronRightIcon className="ek-go" sx={{ color: tokens.ink3, opacity: 0.5, transition: "opacity .12s, transform .12s", flex: "none" }} />
                          ) : (
                            <Tooltip title="Open in Ads Manager">
                              <IconButton
                                className="ek-ext"
                                size="small"
                                component="a"
                                href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${adAccountId.replace(/^act_/, "")}&selected_ad_ids=${r.id}`}
                                target="_blank"
                                rel="noopener"
                                aria-label={`Open ${r.name} in Ads Manager`}
                                sx={{ opacity: 0.4, transition: "opacity .12s", flex: "none", "&:focus-visible": { opacity: 1 } }}
                              >
                                <OpenInNewIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", fontSize: 13 }}>
                        <Box component="span" sx={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", bgcolor: d.color, mr: 0.75 }} />
                        {d.label}
                      </TableCell>
                      {view.level !== "ad" && <TableCell sx={{ whiteSpace: "nowrap", fontSize: 13, color: r.dailyBudget || r.lifetimeBudget ? tokens.ink : tokens.ink3 }}>{budget(r, view.level)}</TableCell>}
                      {METRICS.map((m) => (
                        <TableCell key={m.key} align="right" sx={{ fontVariantNumeric: "tabular-nums", fontSize: 13.5, whiteSpace: "nowrap", bgcolor: TONE_BG[toneOf(m, v[m.key], r)] }}>
                          {formatMetric(m.key, v[m.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                <TableRow sx={{ position: "sticky", bottom: 0, zIndex: 2, "& td": { bgcolor: tokens.surface2, fontWeight: 600, fontSize: 13.5, borderTop: `2px solid ${tokens.divider}`, whiteSpace: "nowrap" } }}>
                  <TableCell sx={{ ...stickyName, bgcolor: `${tokens.surface2} !important`, zIndex: 3 }}>Results from {rows.length} {rows.length === 1 ? word.one : word.many.toLowerCase()}</TableCell>
                  <TableCell />
                  {view.level !== "ad" && <TableCell />}
                  {METRICS.map((m) => (
                    <TableCell key={m.key} align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{formatMetric(m.key, totalV[m.key])}</TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", p: "10px 16px", fontSize: 12, color: tokens.ink2, borderTop: `1px solid ${tokens.divider}` }}>
            {(["good", "near", "bad"] as const).map((t) => (
              <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 14, height: 14, bgcolor: TONE_BG[t], border: `1px solid ${tokens.divider}` }} />
                {t === "good" ? "On target" : t === "near" ? "Close (within 20%)" : "Off target"}
              </Box>
            ))}
            <span>No colour: under R150 spent or fewer than 3 leads</span>
            {clickable && <Box component="span" sx={{ ml: "auto", color: tokens.ink3 }}>Click a {word.one} to see its {view.level === "campaign" ? "ad sets" : "ads"}</Box>}
          </Box>
        </>
      )}

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
