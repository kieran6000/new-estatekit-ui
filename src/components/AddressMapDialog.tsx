import { useEffect, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Paper, Skeleton, Typography, useMediaQuery } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { listSoldListingsForAgent } from "../api/soldListings";
import { nearby } from "../lib/geo";
import { cachedGeocode, drawMap, geocodeAddress, hasMapsKey, HOUSE_PIN, metresToPixels, onMapsKeyRefused, staticMapUrl, streetPhotoUrl, UNSURE_METRES, warmUpMaps } from "../lib/googleMaps";
import { tokens } from "../theme";

const NEARBY_KM = 5;
const money = (n: number) => "R " + n.toLocaleString("en-ZA");
const frame = { borderRadius: "6px", overflow: "hidden", border: `1px solid ${tokens.divider}` };
// Photo sizes match the box's shape on that screen: phone 8:5, otherwise square.
const PHONE_PHOTO = { width: 640, height: 400 };
const SQUARE_PHOTO = { width: 640, height: 640 };

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box sx={{ display: "flex", p: "10px 16px", borderTop: `1px solid ${tokens.divider2}`, gap: 1.5, "&:first-of-type": { borderTop: 0 } }}>
      <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 46%" }}>{k}</Typography>
      <Typography sx={{ fontSize: 14, flex: 1 }}>{v}</Typography>
    </Box>
  );
}

/** While the map comes in: a sketch of streets with our pin landing on it, and
 *  a soft ring moving out. Still for people who've asked for less motion. */
function MapLoader() {
  return (
    <Box
      aria-label="Loading the map"
      role="status"
      sx={{
        position: "absolute", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", bgcolor: "#f3f4f6",
        "@keyframes ekPinLand": { "0%": { transform: "translateY(-26px)", opacity: 0 }, "60%": { transform: "translateY(0)", opacity: 1 }, "78%": { transform: "translateY(-5px)" }, "100%": { transform: "translateY(0)", opacity: 1 } },
        "@keyframes ekPinRing": { "0%": { transform: "scale(.2)", opacity: 0.35 }, "100%": { transform: "scale(1)", opacity: 0 } },
        "@media (prefers-reduced-motion: reduce)": { "& *": { animation: "none !important" } },
      }}
    >
      <Box component="svg" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" aria-hidden sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <g fill="none" stroke="#dfe3e8" strokeWidth="7" strokeLinecap="round">
          <path d="M-10 150 C60 130 90 120 150 100 S250 50 310 40" />
          <path d="M60 -10 C70 50 90 90 120 112 S180 170 190 210" />
          <path d="M215 -10 C205 40 225 80 250 100 S300 130 320 135" strokeWidth="5" />
          <path d="M-10 60 C30 62 60 58 82 66" strokeWidth="5" />
        </g>
      </Box>
      <Box sx={{ position: "absolute", width: 130, height: 130, borderRadius: "50%", bgcolor: "#0b57d0", opacity: 0, animation: "ekPinRing 1.6s ease-out infinite" }} />
      <Box component="img" alt="" src={HOUSE_PIN} sx={{ position: "relative", width: 40, height: 46, animation: "ekPinLand .55s ease-out both" }} />
    </Box>
  );
}

/** The address on a clean Google map, the house from the road when Google has
 *  a photo, and what the agent has sold close by. If our map can't be used (no
 *  key, or Google refuses this web address) it falls back to Google's plain
 *  embed, which needs no key. It's mounted, closed, with every address row, so
 *  the map code and any saved location are ready before the tap. */
export default function AddressMapDialog({ address, agentId, open, onClose }: { address: string; agentId?: string; open: boolean; onClose: () => void }) {
  useEffect(() => { warmUpMaps(); }, []);
  // Never leave them on the loader: if Google says no, use the plain embed.
  useEffect(() => onMapsKeyRefused(() => setMapFailed(true)), []);
  const { data: saved, isLoading: checking } = useQuery({
    queryKey: ["geocodeSaved", address],
    queryFn: () => cachedGeocode(address),
    enabled: hasMapsKey(),
    staleTime: Infinity,
    retry: false,
  });
  const { data: looked, isLoading: looking } = useQuery({
    queryKey: ["geocode", address],
    queryFn: () => geocodeAddress(address),
    enabled: open && hasMapsKey() && saved === "unknown",
    staleTime: Infinity,
    retry: false,
  });
  const geo = saved === "unknown" || saved === undefined ? looked : saved;
  const isLoading = hasMapsKey() && (checking || looking);

  const [mapEl, setMapEl] = useState<HTMLElement | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [picture, setPicture] = useState<{ width: number; height: number } | null>(null);
  const [pictureReady, setPictureReady] = useState(false);
  const [noPhoto, setNoPhoto] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  useEffect(() => {
    if (!mapEl || !geo) return;
    setPicture({ width: mapEl.clientWidth, height: mapEl.clientHeight });
    let gone = false;
    let stop: (() => void) | undefined;
    drawMap(mapEl, geo, geo.exact ? 17 : 15, !geo.exact, () => { if (!gone) setMapReady(true); })
      .then((s) => { if (gone) s(); else stop = s; })
      .catch(() => setMapFailed(true));
    return () => { gone = true; stop?.(); setMapReady(false); setPictureReady(false); };
  }, [mapEl, geo]);
  const wide = useMediaQuery("(min-width:600px)");
  const photo = wide ? SQUARE_PHOTO : PHONE_PHOTO;

  const { data: sales = [] } = useQuery({
    queryKey: ["salesNearby", agentId, geo?.lat, geo?.lng],
    enabled: open && !!geo && !!agentId,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const sold = (await listSoldListingsForAgent(agentId!)).filter((s) => s.status === "sold").slice(0, 25);
      const located = await Promise.all(sold.map(async (s) => ({ ...s, at: await geocodeAddress(s.address).catch(() => null) })));
      return nearby(geo!, located, NEARBY_KM);
    },
  });

  const zoom = geo?.exact ? 17 : 15;
  const q = encodeURIComponent(/south africa/i.test(address) ? address : `${address}, South Africa`);
  const ours = !!geo && !mapFailed;
  const showPhoto = ours && geo.exact && !noPhoto;
  const prices = sales.flatMap((s) => (s.price ? [s.price] : []));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Beside the photo the map is the same square; on its own it's a wide strip.
  const tile = { ...frame, position: "relative", height: showPhoto ? { xs: 200, sm: "auto" } : { xs: 200, sm: 300 }, ...(showPhoto ? { aspectRatio: { sm: "1" } } : {}) };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" transitionDuration={150}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{address}</Box>
        <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: showPhoto ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }, gap: 1.5 }}>
          {isLoading ? (
            <Box sx={tile}><MapLoader /></Box>
          ) : ours ? (
            <Box sx={tile}>
              <Box ref={setMapEl} role="img" aria-label={`Map of ${address}`} sx={{ position: "absolute", inset: 0 }} />
              {/* The map as a picture, lined up with the live map underneath, until the live one is in. */}
              {!mapReady && picture && geo && (
                <Box sx={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                  <Box
                    component="img"
                    alt=""
                    src={staticMapUrl(geo, zoom, picture.width, picture.height)}
                    fetchPriority="high"
                    onLoad={() => setPictureReady(true)}
                    onError={() => setMapFailed(true)}
                    sx={{ display: "block", width: "100%", height: "100%" }}
                  />
                  {!geo.exact && (
                    <Box sx={{
                      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", borderRadius: "50%",
                      width: 2 * metresToPixels(UNSURE_METRES, geo.lat, zoom), height: 2 * metresToPixels(UNSURE_METRES, geo.lat, zoom),
                      bgcolor: "rgba(11, 87, 208, .05)", border: "1px solid rgba(11, 87, 208, .22)",
                    }} />
                  )}
                  <Box component="img" alt="" src={HOUSE_PIN} sx={{ position: "absolute", left: "50%", top: "50%", width: 40, height: 46, transform: "translate(-50%, -100%)" }} />
                </Box>
              )}
              {!mapReady && !pictureReady && <MapLoader />}
            </Box>
          ) : (
            <Box sx={tile}>
              <Box
                component="iframe"
                title={`Map of ${address}`}
                src={open ? `https://www.google.com/maps?q=${q}&output=embed&t=m&z=17` : undefined}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                sx={{ display: "block", width: "100%", height: "100%", border: 0 }}
              />
            </Box>
          )}
          {showPhoto && (
            <Box sx={{ ...frame, position: "relative", aspectRatio: { xs: "8 / 5", sm: "1" } }}>
              {!photoReady && <Skeleton variant="rectangular" animation="wave" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
              <Box
                component="img"
                alt={`The most likely house at ${address}, from the road`}
                src={streetPhotoUrl(geo, photo.width, photo.height)}
                fetchPriority="high"
                onLoad={() => setPhotoReady(true)}
                onError={() => setNoPhoto(true)}
                sx={{ display: "block", width: "100%", height: "100%", opacity: photoReady ? 1 : 0, transition: "opacity .2s" }}
              />
            </Box>
          )}
        </Box>

        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>
          {isLoading
            ? "Finding the address…"
            : ours && !geo.exact
              ? "Google couldn't find this exact address, so this is the closest area. Confirm it with them."
              : "This is the most likely spot. Confirm the address with them."}
        </Typography>

        {sales.length > 0 && (
          <Paper variant="outlined" sx={{ mt: 1.5, borderRadius: "6px" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "14px 16px 4px" }}>
              Your sales nearby
            </Typography>
            <Row k={`Sold within ${NEARBY_KM} km`} v={`${sales.length} ${sales.length === 1 ? "home" : "homes"}`} />
            {prices.length > 0 && <Row k="Sold for" v={low === high ? money(low) : `${money(low)} to ${money(high)}`} />}
          </Paper>
        )}
      </DialogContent>
    </Dialog>
  );
}
