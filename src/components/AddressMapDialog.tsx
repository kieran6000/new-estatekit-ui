import { useEffect, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Skeleton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { listSoldListingsForAgent } from "../api/soldListings";
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", gap: 1, pr: 1 }}>
        <Typography component="span" sx={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{address}</Typography>
        <IconButton aria-label="Close" size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {isLoading ? (
          <Skeleton variant="rectangular" sx={{ width: "100%", height: { xs: 300, sm: 340 } }} />
        ) : ours ? (
          <Box ref={setMapEl} role="img" aria-label={`Map of ${address}`} sx={{ width: "100%", height: { xs: 300, sm: 340 } }} />
        ) : (
          <Box
            component="iframe"
            title={`Map of ${address}`}
            src={open ? `https://www.google.com/maps?q=${q}&output=embed&t=m&z=17` : undefined}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            sx={{ display: "block", width: "100%", height: { xs: 360, sm: 420 }, border: 0 }}
          />
        )}

        {showPhoto && (
          <Box
            component="img"
            alt={`The most likely house at ${address}, from the road`}
            src={streetPhotoUrl(geo)}
            onError={() => setNoPhoto(true)}
            sx={{ display: "block", width: "100%", height: { xs: 180, sm: 240 }, objectFit: "cover", mt: "2px" }}
          />
        )}

        <Box sx={{ p: "10px 16px" }}>
          <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
            {ours && !geo.exact
              ? "Google couldn't find this exact address, so the pin shows the closest area it found. Confirm the address with them."
              : showPhoto
                ? "The pin and photo show the most likely house for the address they typed. It may not be the exact one, so confirm it with them."
                : "The pin shows the most likely spot for the address they typed. It may not be the exact house, so confirm it with them."}
          </Typography>
        </Box>

        {sales.length > 0 && (
          <Box sx={{ p: "4px 16px 14px" }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 0.75 }}>
              You've sold {sales.length} {sales.length === 1 ? "home" : "homes"} within {NEARBY_KM} km
            </Typography>
            {sales.slice(0, 3).map((s) => (
              <Box key={s.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14 }}>{s.address}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{kmWords(s.km)}</Typography>
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{money(s.price)}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
