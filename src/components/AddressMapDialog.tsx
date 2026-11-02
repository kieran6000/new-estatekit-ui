import { useEffect, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Skeleton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { listSoldListingsForAgent } from "../api/soldListings";
import { tokens } from "../theme";
import { nearby } from "../lib/geo";
import { drawMap, geocodeAddress, hasMapsKey, streetPhotoUrl } from "../lib/googleMaps";

const NEARBY_KM = 5;
const money = (n: number | null) => (n ? "R " + n.toLocaleString("en-ZA") : "");
const kmWords = (km: number) => (km < 1 ? "under 1 km away" : `${km.toFixed(1)} km away`);

/** The address on a clean Google map, the house from the road when Google has
 *  a photo, and the agent's own sales close by. If our map can't be used (no
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
    if (mapEl && geo) drawMap(mapEl, geo, geo.exact ? 17 : 15).catch(() => setMapFailed(true));
  }, [mapEl, geo]);

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

  const tile = { borderRadius: "12px", overflow: "hidden", bgcolor: "action.hover", height: { xs: 240, md: 300 } };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={showPhoto ? "md" : "sm"} slotProps={{ paper: { sx: { borderRadius: "16px" } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, p: "16px 12px 12px 20px" }}>
        <Typography component="span" sx={{ flex: 1, fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{address}</Typography>
        <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: "0 20px 20px" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: showPhoto ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }, gap: 1.5 }}>
          {isLoading ? (
            <Skeleton variant="rectangular" sx={tile} />
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
            <Box sx={tile}>
              <Box
                component="img"
                alt={`The most likely house at ${address}, from the road`}
                src={streetPhotoUrl(geo)}
                onError={() => setNoPhoto(true)}
                sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Box>
          )}
        </Box>

        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.25 }}>
          {ours && !geo.exact
            ? "Google couldn't find this exact address, so the pin shows the closest area it found. Confirm the address with them."
            : showPhoto
              ? "Most likely house for the address they typed. Confirm it with them."
              : "Most likely spot for the address they typed. Confirm it with them."}
        </Typography>

        {sales.length > 0 && (
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 1.25 }}>
              You've sold {sales.length} {sales.length === 1 ? "home" : "homes"} within {NEARBY_KM} km
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
              {sales.slice(0, 3).map((s) => (
                <Box key={s.id} sx={{ display: "flex", flexDirection: { xs: "row", sm: "column" }, border: `1px solid ${tokens.divider}`, borderRadius: "12px", overflow: "hidden" }}>
                  <Box
                    sx={{ flexShrink: 0, width: { xs: 96, sm: "100%" }, height: { xs: "auto", sm: 96 }, minHeight: { xs: 84, sm: 0 }, bgcolor: "action.hover", backgroundImage: s.imageUrl ? `url("${s.imageUrl}")` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                  <Box sx={{ p: "10px 12px", minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{money(s.price)}</Typography>
                    <Typography sx={{ fontSize: 13, lineHeight: 1.35, mt: 0.25 }}>{s.address}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>{kmWords(s.km)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
