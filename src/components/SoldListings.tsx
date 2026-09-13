import { Box, Typography } from "@mui/material";
import type { SoldListing } from "../api/soldListings";

function rands(n: number | null): string {
  if (n == null) return "";
  return "R" + Math.round(n).toLocaleString("en-ZA");
}

/** Compact social-proof strip: up to 3 SOLD thumbnails + a rating/count line.
 *  Shown under the form on the public lead page. */
export function SoldStrip({ listings, area, accent }: { listings: SoldListing[]; area?: string; accent: string }) {
  const withImg = listings.filter((l) => l.imageUrl);
  if (!listings.length) return null;
  const tiles = withImg.slice(0, 3);
  return (
    <Box>
      {tiles.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
          {tiles.map((l) => (
            <Box key={l.id} sx={{ position: "relative", borderRadius: "8px", overflow: "hidden", aspectRatio: "4 / 3", bgcolor: "#e4e7e5" }}>
              <Box component="img" src={l.imageUrl!} alt={l.status === "sold" ? "Recently sold home" : "Recently listed home"} loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <Box sx={{ position: "absolute", left: 4, bottom: 4, bgcolor: accent, color: "#fff", fontWeight: 800, fontSize: 10, letterSpacing: "0.5px", borderRadius: "4px", px: 0.75, py: 0.25 }}>
                {l.status === "sold" ? "SOLD" : "LISTED"}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 0.5, mt: 1.25, fontSize: 13, fontWeight: 600, color: "#2b2820" }}>
        <Box component="span" sx={{ color: "#e7a81c", letterSpacing: "1px" }}>★★★★★</Box>
        <span>5.0</span>
        <span>·</span>
        <span>{listings.length} recent {listings.length === 1 ? "sale/listing" : "sales/listings"}{area ? ` in ${area}` : ""}</span>
      </Box>
    </Box>
  );
}

/** Full list of sold homes with price — shown on the thank-you screen. */
export function SoldList({ listings }: { listings: SoldListing[] }) {
  if (!listings.length) return null;
  return (
    <Box>
      <Typography sx={{ fontSize: 17, fontWeight: 800, textAlign: "center", mt: 2, mb: 1.5, color: "#17150f" }}>Recent Sales &amp; Listings</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {listings.map((l) => (
          <Box key={l.id} sx={{ borderRadius: "12px", overflow: "hidden", bgcolor: "#fff", boxShadow: "0 8px 24px -18px rgba(20,40,30,.4)", border: "1px solid #eceef1" }}>
            {l.imageUrl && <Box component="img" src={l.imageUrl} alt={l.address} loading="lazy" sx={{ width: "100%", height: 170, objectFit: "cover", display: "block", bgcolor: "#e4e7e5" }} />}
            <Box sx={{ p: "12px 14px", textAlign: "center" }}>
              {l.address && <Typography sx={{ fontSize: 14.5, color: "#2b2820" }}>{l.address}</Typography>}
              {l.price != null && (
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#17150f" }}>
                  {l.status === "sold" ? "Sold for" : "Listed at"} {rands(l.price)}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
