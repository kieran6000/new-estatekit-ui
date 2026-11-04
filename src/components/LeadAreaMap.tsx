import { useEffect, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
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
    <Box sx={{ flex: 1, minWidth: 0, textAlign: "center", py: 0.5, "& + &": { borderLeft: `1px solid ${tokens.divider2}` } }}>
      <Typography sx={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", color: strong ? "text.primary" : tokens.ink2 }}>{n}</Typography>
      <Typography sx={{ fontSize: 13, color: tokens.ink2 }}>{label}</Typography>
    </Box>
  );
}

/** Their area as one shaded circle, a dot for each lead. A dot in the circle is
 *  in their area. The same counts sit underneath, so it needs no explaining. */
export default function LeadAreaMap({ agentId, areas }: { agentId: string; areas: { name: string; address: string }[] }) {
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
      <Box sx={{ px: 2, pt: 1.5, pb: 1, minHeight: 44, display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>Where their leads are</Typography>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>All time</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2, flex: 1, display: "flex", flexDirection: "column" }}>
        {isLoading ? (
          <Skeleton variant="rectangular" height={300} sx={{ borderRadius: "6px" }} />
        ) : failed || isError ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>The map couldn't load. Try again in a minute.</Typography>
        ) : !leads.length ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No leads with an address yet.</Typography>
        ) : (
          <>
            <Box sx={{ position: "relative", flex: 1, minHeight: 220, borderRadius: "6px", overflow: "hidden", border: `1px solid ${tokens.divider}` }}>
              <Box ref={setEl} role="img" aria-label="Map of their area and where their leads are" sx={{ position: "absolute", inset: 0 }} />
              {!ready && <Skeleton variant="rectangular" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
            </Box>
            {zone ? (
              <>
                <Box sx={{ display: "flex", mt: 1.5 }}>
                  <Count n={count("in")} label="In their area" strong />
                  <Count n={count("near")} label="Close by" />
                  <Count n={count("far")} label="Further away" />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1.25, minWidth: 0 }}>
                  <Box sx={{ width: 12, height: 12, flex: "none", borderRadius: "50%", bgcolor: `${ZONE_COLOR}22`, border: `1px solid ${ZONE_COLOR}88` }} />
                  <Typography title={areas.map((a) => a.name).join(", ")} sx={{ fontSize: 13, color: tokens.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Their area: {areas.map((a) => a.name).join(", ")}
                  </Typography>
                </Box>
              </>
            ) : (
              <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 1.25 }}>Add their suburbs in the Brief tab to see their area on this map.</Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
