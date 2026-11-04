import { useEffect, useState } from "react";
import { Box, Skeleton, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/_client";
import { prettyAnswer } from "../lib/format";
import { addressKey, areaKm, distanceKm, leadsByArea, middleOf, type LatLng } from "../lib/geo";
import { drawHeatMap, geocodeMany, hasMapsKey, onMapsKeyRefused } from "../lib/googleMaps";
import { tokens } from "../theme";

// Each new address is looked up once, ever, so this only limits a first visit.
const MAX_NEW_LOOKUPS = 60;
const MAX_LEADS = 300;
/** Further from the middle of their leads than this isn't drawn, or one lead in another province would zoom the map right out. */
const MAP_KM = 60;

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
    withAddress: addresses.length,
    leads: addresses.flatMap((a) => { const p = at(a); return p ? [{ lat: p.lat, lng: p.lng }] : []; }),
    areas: areas.flatMap((a) => { const p = at(a.address); return p ? [{ name: a.name, km: areaKm(a.name), at: { lat: p.lat, lng: p.lng } }] : []; }),
  };
}

/** Where their leads are on the map, against the areas they asked for. */
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

  const middle = data ? middleOf(data.leads.length ? data.leads : data.areas.map((a) => a.at)) : null;
  const close = (p: LatLng) => !!middle && distanceKm(middle, p) <= MAP_KM;
  const onMap = data?.leads.filter(close) ?? [];
  const areasOnMap = data?.areas.filter((a) => close(a.at)) ?? [];
  const summary = data ? leadsByArea(data.leads, data.areas) : null;

  useEffect(() => {
    if (!el || !onMap.length) return;
    setReady(false);
    drawHeatMap(el, onMap, areasOnMap.map((a) => ({ ...a.at, metres: a.km * 1000 })), () => setReady(true)).catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, data]);

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, minHeight: 44, display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>Where their leads are</Typography>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>All time</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        {isLoading ? (
          <Skeleton variant="rectangular" height={260} sx={{ borderRadius: "6px" }} />
        ) : failed || isError ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>The map couldn't load. Try again in a minute.</Typography>
        ) : !onMap.length ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No leads with an address yet.</Typography>
        ) : (
          <>
            <Box sx={{ position: "relative", height: 260, borderRadius: "6px", overflow: "hidden", border: `1px solid ${tokens.divider}` }}>
              <Box ref={setEl} role="img" aria-label="Map of where their leads are" sx={{ position: "absolute", inset: 0 }} />
              {!ready && <Skeleton variant="rectangular" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
            </Box>
            {summary && data!.areas.length > 0 ? (
              <>
                <Typography sx={{ fontSize: 14, fontWeight: 500, mt: 1.5 }}>
                  About {summary.inArea} of {data!.leads.length} leads are in the areas they asked for
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
                  {summary.counts.map((c) => (
                    <Box key={c.area.name} sx={{ fontSize: 12.5, px: 1, py: 0.25, borderRadius: "999px", border: `1px solid ${tokens.divider}`, color: c.leads ? "text.primary" : tokens.ink3 }}>
                      {c.area.name} · {c.leads}
                    </Box>
                  ))}
                </Box>
              </>
            ) : (
              <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 1.5 }}>Add their top suburbs in the Brief tab to compare these leads with the areas they asked for.</Typography>
            )}
            <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 1 }}>
              Red shows the most leads. Blue circles roughly show the areas they asked for.
              {data!.leads.length > onMap.length ? ` ${data!.leads.length - onMap.length} further away aren't shown.` : ""}
              {data!.withAddress > data!.leads.length ? ` ${data!.withAddress - data!.leads.length} couldn't be placed yet.` : ""}
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
