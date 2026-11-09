import { useEffect, useState } from "react";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/_client";
import { prettyAnswer } from "../lib/format";
import { addressKey, areaKm, CLOSE_BY_KM, distanceKm, middleOf, placeOf, zonesFrom, type LatLng, type Zone } from "../lib/geo";
import { drawLeadMap, geocodeMany, hasMapsKey, onMapsKeyRefused, ZONE_COLOR } from "../lib/googleMaps";
import { tokens } from "../theme";

// Each new address is looked up once, ever, so this only limits a first visit.
const MAX_NEW_LOOKUPS = 60;
const MAX_LEADS = 300;
/** With no areas to centre on, how far from the middle of their leads the map reaches. */
const NO_AREA_KM = 20;

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
    zones: zonesFrom(areas.flatMap((a) => { const p = at(a.address); return p ? [{ km: areaKm(a.name), at: { lat: p.lat, lng: p.lng } }] : []; })),
  };
}

const within = (p: LatLng, z: Zone, extraKm: number) => distanceKm(p, z.center) <= z.km + extraKm;

function Count({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", color: strong ? "text.primary" : tokens.ink2 }}>{n}</Typography>
      <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>{label}</Typography>
    </Box>
  );
}

/** Their area as one shaded circle, a dot for each lead. A dot in the circle is
 *  in their area. The same counts sit underneath, so it needs no explaining. */
export default function LeadAreaMap({ agentId, areas, addAreasHref }: { agentId: string; areas: { name: string; address: string }[]; /** Where to add their suburbs, when none are known. */ addAreasHref?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["leadAreaMap", agentId, areas.map((a) => a.address).join("|")],
    queryFn: () => loadPlaces(agentId, areas),
    enabled: hasMapsKey(),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!hasMapsKey());
  useEffect(() => onMapsKeyRefused(() => setFailed(true)), []);

  const leads = data?.leads ?? [];
  const zones = data?.zones ?? [];
  // The map shows the area most of their leads are in.
  const zone = zones.length
    ? zones.map((z) => ({ z, n: leads.filter((p) => within(p, z, 0)).length })).sort((a, b) => b.n - a.n)[0].z
    : null;
  const middle = middleOf(leads);
  const onMap = zone
    ? leads.filter((p) => within(p, zone, CLOSE_BY_KM))
    : leads.filter((p) => !!middle && distanceKm(middle, p) <= NO_AREA_KM);
  const count = (place: "in" | "near" | "far") => (zones.length ? leads.filter((p) => placeOf(p, zones) === place).length : 0);

  useEffect(() => {
    if (!el || !leads.length) return;
    setReady(false);
    drawLeadMap(el, zone, onMap, () => setReady(true)).catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, data]);

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, minHeight: 40, display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>Where their leads are</Typography>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>All time</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 1.75, flex: 1, display: "flex", flexDirection: "column" }}>
        {isLoading ? (
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: "6px" }} />
        ) : failed || isError ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>The map couldn't load. Try again in a minute.</Typography>
        ) : !leads.length ? (
          areas.length ? (
            <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No leads with an address yet. When they come in, you'll see how many are in {areas.slice(0, 3).map((a) => a.name).join(", ")}{areas.length > 3 ? " and their other areas" : ""}.</Typography>
          ) : (
            <Box>
              <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>Add the suburbs they work in, and this shows how many of their leads are close by.</Typography>
              {addAreasHref && <Button component={RouterLink} to={addAreasHref} variant="outlined" size="small" sx={{ mt: 1.25 }}>Add their suburbs</Button>}
            </Box>
          )
        ) : (
          <Box sx={{ display: "flex", gap: 2, flex: 1, minWidth: 0 }}>
            <Box sx={{ position: "relative", width: { xs: 110, sm: 170 }, minHeight: 116, flex: "none", borderRadius: "6px", overflow: "hidden", border: `1px solid ${tokens.divider}` }}>
              <Box ref={setEl} role="img" aria-label="Small map of their area and where their leads are" sx={{ position: "absolute", inset: 0 }} />
              {!ready && <Skeleton variant="rectangular" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              {zone ? (
                <>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Count n={count("in")} label="In their area" strong />
                    <Count n={count("near")} label="Close by" />
                    <Count n={count("far")} label="Further away" />
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1.25, minWidth: 0 }}>
                    <Box sx={{ width: 12, height: 12, flex: "none", borderRadius: "50%", bgcolor: `${ZONE_COLOR}22`, border: `1px solid ${ZONE_COLOR}88` }} />
                    <Typography title={areas.map((a) => a.name).join(", ")} sx={{ fontSize: 13, color: tokens.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {areas.map((a) => a.name).join(", ")}
                    </Typography>
                  </Box>
                </>
              ) : (
                <Typography sx={{ fontSize: 13, color: tokens.ink2 }}>Add their suburbs in the Brief tab to see their area here.</Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
