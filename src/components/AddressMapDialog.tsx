import { useEffect, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Paper, Skeleton, Typography, useMediaQuery } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { listSoldListingsForAgent } from "../api/soldListings";
import { nearby } from "../lib/geo";
import { drawMap, geocodeAddress, hasMapsKey, streetPhotoUrl } from "../lib/googleMaps";
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

/** The address on a clean Google map, the house from the road when Google has
 *  a photo, and what the agent has sold close by. If our map can't be used (no
 *  key, or Google refuses this web address) it falls back to Google's plain
 *  embed, which needs no key. */
export default function AddressMapDialog({ address, agentId, open, onClose }: { address: string; agentId?: string; open: boolean; onClose: () => void }) {
  const { data: geo, isLoading } = useQuery({
    queryKey: ["geocode", address],
    queryFn: () => geocodeAddress(address),
    enabled: open && hasMapsKey(),
    staleTime: Infinity,
    retry: false,
  });

  const [mapEl, setMapEl] = useState<HTMLElement | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [noPhoto, setNoPhoto] = useState(false);
  useEffect(() => {
    if (!mapEl || !geo) return;
    let gone = false;
    let stop: (() => void) | undefined;
    drawMap(mapEl, geo, geo.exact ? 17 : 15, !geo.exact)
      .then((s) => { if (gone) s(); else stop = s; })
      .catch(() => setMapFailed(true));
    return () => { gone = true; stop?.(); };
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

  const q = encodeURIComponent(/south africa/i.test(address) ? address : `${address}, South Africa`);
  const ours = !!geo && !mapFailed;
  const showPhoto = ours && geo.exact && !noPhoto;
  const prices = sales.flatMap((s) => (s.price ? [s.price] : []));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Beside the photo the map is the same square; on its own it's a wide strip.
  const tile = { ...frame, height: showPhoto ? { xs: 200, sm: "auto" } : { xs: 200, sm: 300 }, aspectRatio: showPhoto ? { sm: "1" } : undefined };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{address}</Box>
        <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: showPhoto ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }, gap: 1.5 }}>
          {isLoading ? (
            <Skeleton variant="rounded" sx={{ ...tile, border: 0 }} />
          ) : ours ? (
            <Box ref={setMapEl} role="img" aria-label={`Map of ${address}`} sx={tile} />
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
            <Box
              component="img"
              alt={`The most likely house at ${address}, from the road`}
              src={streetPhotoUrl(geo, photo.width, photo.height)}
              onError={() => setNoPhoto(true)}
              sx={{ ...frame, display: "block", width: "100%", height: "auto", aspectRatio: { xs: "8 / 5", sm: "1" } }}
            />
          )}
        </Box>

        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>
          {ours && !geo.exact
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
