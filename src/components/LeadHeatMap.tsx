import { useEffect, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/_client";
import { prettyAnswer } from "../lib/format";
import { addressKey, areaKm, distanceKm, inAnyArea, middleOf, type LatLng } from "../lib/geo";
import { drawLeadMap, geocodeMany, hasMapsKey, LEAD_DOT, onMapsKeyRefused } from "../lib/googleMaps";
import { tokens } from "../theme";
import StatusStrip from "./StatusStrip";

// Each new address is looked up once, ever, so this only limits a first visit.
const MAX_NEW_LOOKUPS = 60;
const MAX_LEADS = 300;
/** Further from the middle of their leads than this isn't drawn, or one lead in another province would zoom the map right out. */
const MAP_KM = 20;
/** From this share of leads in their areas, the strip is green rather than amber. */
const GOOD_SHARE = 0.6;

const addressOf = (answers: { q: string; a: string }[] | null) => {
  const hit = (answers ?? []).find((x) => /address/i.test(x.q) && !/mail/i.test(x.q) && prettyAnswer(x.a).trim().length > 4);
  return hit ? prettyAnswer(hit.a).trim() : null;
};

async function loadPlaces(agentId: string, areas: { name: string; address: string }[]) {
  const { data, error } = await supabase
    .from("leads").select("form_answers").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(MAX_LEADS);
  if (error) throw error;
  const addresses = (data ?? []).map((l) => addressOf(l.form_answers as { q: string; a: string }[] | null)).filter((a): a is string => !!a);
  const found = await geocodeMany([...areas.map((a) => a.address), ...addresses], MAX_NEW_LOOKUPS);
  const at = (address: string) => found.get(addressKey(address)) ?? null;
  return {
    leads: addresses.flatMap((a) => { const p = at(a); return p ? [{ lat: p.lat, lng: p.lng }] : []; }),
    areas: areas.flatMap((a) => { const p = at(a.address); return p ? [{ km: areaKm(a.name), at: { lat: p.lat, lng: p.lng } }] : []; }),
  };
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: 13 }}>
      <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flex: "none" }} />
      {label}
    </Box>
  );
}

/** Where their leads are: a dot for each, green if it's in an area they asked
 *  for and red if it isn't. */
export default function LeadHeatMap({ agentId, areas }: { agentId: string; areas: { name: string; address: string }[] }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["leadHeatMap", agentId, areas.map((a) => a.address).join("|")],
    queryFn: () => loadPlaces(agentId, areas),
    enabled: hasMapsKey(),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!hasMapsKey());
  useEffect(() => onMapsKeyRefused(() => setFailed(true)), []);

  const hasAreas = !!data?.areas.length;
  const placed = (data?.leads ?? []).map((p) => ({ ...p, inArea: inAnyArea(p, data?.areas ?? []) }));
  const middle = middleOf(placed);
  const close = (p: LatLng) => !!middle && distanceKm(middle, p) <= MAP_KM;
  const onMap = placed.filter(close);
  const inside = placed.filter((p) => p.inArea).length;
  const outside = placed.length - inside;
  const hidden = placed.length - onMap.length;

  useEffect(() => {
    if (!el || !onMap.length) return;
    setReady(false);
    drawLeadMap(el, onMap.map((p) => ({ lat: p.lat, lng: p.lng, color: !hasAreas ? LEAD_DOT.neutral : p.inArea ? LEAD_DOT.inside : LEAD_DOT.outside })), () => setReady(true)).catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, data]);

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, minHeight: 44, display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>Where their leads are</Typography>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>All time</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2, flex: 1, display: "flex", flexDirection: "column" }}>
        {isLoading ? (
          <Skeleton variant="rectangular" height={280} sx={{ borderRadius: "6px" }} />
        ) : failed || isError ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>The map couldn't load. Try again in a minute.</Typography>
        ) : !onMap.length ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No leads with an address yet.</Typography>
        ) : (
          <>
            {hasAreas ? (
              <StatusStrip ok={inside / placed.length >= GOOD_SHARE}>About {inside} of {placed.length} leads are in their areas</StatusStrip>
            ) : (
              <StatusStrip ok={false}>Add their suburbs in the Brief tab to check these leads</StatusStrip>
            )}
            <Box sx={{ position: "relative", flex: 1, minHeight: 200, mt: 1.5, borderRadius: "6px", overflow: "hidden", border: `1px solid ${tokens.divider}` }}>
              <Box ref={setEl} role="img" aria-label="Map of where their leads are" sx={{ position: "absolute", inset: 0 }} />
              {!ready && <Skeleton variant="rectangular" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 2, rowGap: 0.5, mt: 1.25 }}>
              {hasAreas && <Dot color={LEAD_DOT.inside} label={`In their areas: ${inside}`} />}
              {hasAreas && <Dot color={LEAD_DOT.outside} label={`Outside: ${outside}`} />}
              {hidden > 0 && <Typography component="span" sx={{ fontSize: 13, color: tokens.ink3, ml: { sm: "auto" } }}>{hidden} further out, not shown</Typography>}
            </Box>
            {areas.length > 0 && (
              <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={areas.map((a) => a.name).join(", ")}>
                Their areas: {areas.map((a) => a.name).join(", ")}
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
