import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Typography } from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";
import { tokens } from "../theme";
import { getActiveAds, type ActiveAd } from "../api/agentProfile";

/** Facebook's CTA enum -> the label shown on the button. */
const CTA_LABEL: Record<string, string> = {
  LEARN_MORE: "Learn more",
  SEE_DETAILS: "See details",
  SIGN_UP: "Sign up",
  GET_QUOTE: "Get quote",
  GET_OFFER: "Get offer",
  BOOK_NOW: "Book now",
  CONTACT_US: "Contact us",
  APPLY_NOW: "Apply now",
  SHOP_NOW: "Shop now",
  DOWNLOAD: "Download",
  SEND_MESSAGE: "Send message",
};

function domainOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A single ad rendered the way it appears in the Facebook feed. */
function AdCard({ ad, fallbackPage }: { ad: ActiveAd; fallbackPage: string }) {
  const pageName = ad.pageName || fallbackPage || "Sponsored";
  const initial = pageName.trim().charAt(0).toUpperCase() || "?";

  return (
    <Box
      sx={{
        width: 320, flex: "0 0 auto", bgcolor: "background.paper",
        border: `1px solid ${tokens.divider}`, borderRadius: "10px", overflow: "hidden",
      }}
    >
      {/* Page identity */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, p: "10px 12px" }}>
        <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: tokens.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flex: "0 0 auto" }}>
          {initial}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, wordBreak: "break-word" }}>{pageName}</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
            <Typography sx={{ fontSize: 11.5 }}>Ad ·</Typography>
            <PublicIcon sx={{ fontSize: 12 }} />
          </Box>
        </Box>
      </Box>

      {/* Primary text */}
      {ad.body && (
        <Typography
          sx={{
            px: "12px", pb: 1, fontSize: 13.5, lineHeight: 1.4, whiteSpace: "pre-line",
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {ad.body}
        </Typography>
      )}

      {/* Creative */}
      {ad.imageUrl && (
        <Box component="img" src={ad.imageUrl} alt={ad.headline || ad.name} loading="lazy" sx={{ width: "100%", display: "block" }} />
      )}

      {/* Link bar + CTA */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 12px", bgcolor: "#f0f2f5" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {ad.link && (
            <Typography sx={{ fontSize: 11, color: "text.secondary", textTransform: "lowercase", wordBreak: "break-all" }}>
              {domainOf(ad.link)}
            </Typography>
          )}
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25, wordBreak: "break-word" }}>
            {ad.headline || ad.name}
          </Typography>
        </Box>
        {ad.cta && (
          <Box sx={{ flex: "0 0 auto", bgcolor: "#e4e6eb", borderRadius: "6px", px: 1.5, py: 0.75, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
            {CTA_LABEL[ad.cta] ?? "Learn more"}
          </Box>
        )}
      </Box>

      {/* Which ad this is, for the operator */}
      <Box sx={{ p: "8px 12px", borderTop: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", wordBreak: "break-word" }}>
          {ad.name}{ad.adSetName ? ` · ${ad.adSetName}` : ""}
        </Typography>
      </Box>
    </Box>
  );
}

export default function ActiveAds({ adAccountId, agentName }: { adAccountId?: string; agentName?: string }) {
  const { data: ads, isLoading, isError } = useQuery({
    queryKey: ["activeAds", adAccountId],
    queryFn: () => getActiveAds(adAccountId!),
    enabled: !!adAccountId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!adAccountId) return null;

  return (
    <Box sx={{ p: "16px" }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 1 }}>
        Active ads
      </Typography>

      {isLoading ? (
        <Box sx={{ display: "flex", gap: 1.5 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" animation="wave" width={320} height={430} sx={{ borderRadius: "10px", flex: "0 0 auto" }} />
          ))}
        </Box>
      ) : isError ? (
        <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>Couldn't load ads for this account.</Typography>
      ) : !ads || ads.length === 0 ? (
        <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>No ads are currently running on this account.</Typography>
      ) : (
        <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1 }}>
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} fallbackPage={agentName ?? ""} />
          ))}
        </Box>
      )}
    </Box>
  );
}
