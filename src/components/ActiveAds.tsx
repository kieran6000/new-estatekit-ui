import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, IconButton, Menu, MenuItem, ListItemIcon, Skeleton, Typography } from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LinkIcon from "@mui/icons-material/Link";
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

/** postUrl is built by us as facebook.com/{pageId}/posts/{postId}, so the page
 *  id is recoverable from it. Graph's /picture endpoint is public, so the avatar
 *  needs no access token. */
function pageAvatarFrom(ad: ActiveAd): string {
  if (ad.pageAvatar) return ad.pageAvatar;
  const m = ad.postUrl.match(/facebook\.com\/(\d+)\/posts\//);
  return m ? `https://graph.facebook.com/${m[1]}/picture?type=large` : "";
}

function AdCard({ ad, fallbackPage, adAccountId }: { ad: ActiveAd; fallbackPage: string; adAccountId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  const pageName = ad.pageName || fallbackPage || "Sponsored";
  const avatar = pageAvatarFrom(ad);
  const adsManagerUrl =
    `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${adAccountId}` +
    `&selected_ad_ids=${ad.id}`;

  async function copyPostLink() {
    try {
      await navigator.clipboard.writeText(ad.postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
    setMenuEl(null);
  }

  return (
    <Box
      sx={{
        width: { xs: "100%", sm: 340 }, flex: { xs: "1 1 100%", sm: "0 0 auto" },
        bgcolor: "background.paper", border: `1px solid ${tokens.divider}`,
        borderRadius: "10px", overflow: "hidden",
      }}
    >
      {/* Page identity + actions */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, p: "10px 6px 10px 12px" }}>
        {avatar ? (
          <Box component="img" src={avatar} alt="" sx={{ width: 36, height: 36, borderRadius: "50%", flex: "0 0 auto", objectFit: "cover" }} />
        ) : (
          <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: tokens.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flex: "0 0 auto" }}>
            {pageName.trim().charAt(0).toUpperCase() || "?"}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, wordBreak: "break-word" }}>{pageName}</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
            <Typography sx={{ fontSize: 11.5 }}>Ad ·</Typography>
            <PublicIcon sx={{ fontSize: 12 }} />
          </Box>
        </Box>
        <IconButton size="small" onClick={(e) => setMenuEl(e.currentTarget)} aria-label="Ad options">
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
          <MenuItem component="a" href={adsManagerUrl} target="_blank" rel="noopener" onClick={() => setMenuEl(null)}>
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
            Open in Ads Manager
          </MenuItem>
          {ad.postUrl && (
            <MenuItem onClick={copyPostLink}>
              <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
              {copied ? "Link copied" : "Copy link to post"}
            </MenuItem>
          )}
          {ad.postUrl && (
            <MenuItem component="a" href={ad.postUrl} target="_blank" rel="noopener" onClick={() => setMenuEl(null)}>
              <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
              View post on Facebook
            </MenuItem>
          )}
        </Menu>
      </Box>

      {/* Primary text — tap to expand/collapse, like FB's "see more" */}
      {ad.body && (
        <Box sx={{ px: "12px", pb: 1, cursor: "pointer" }} onClick={() => setExpanded((v) => !v)}>
          <Typography
            sx={{
              fontSize: 13.5, lineHeight: 1.4, whiteSpace: "pre-line",
              ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }),
            }}
          >
            {ad.body}
          </Typography>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary", mt: 0.25 }}>
            {expanded ? "See less" : "See more"}
          </Typography>
        </Box>
      )}

      {ad.imageUrl && (
        <Box component="img" src={ad.imageUrl} alt={ad.headline || ad.name} loading="lazy" sx={{ width: "100%", display: "block" }} />
      )}

      {/* Link bar + CTA */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 12px", bgcolor: "#f0f2f5" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {ad.link && (
            <Typography sx={{ fontSize: 11, color: "text.secondary", wordBreak: "break-all" }}>
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

  if (!adAccountId) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
          No ad account linked for this client.
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, p: 2 }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} variant="rounded" animation="wave" height={430}
            sx={{ borderRadius: "10px", width: { xs: "100%", sm: 340 }, flex: { xs: "1 1 100%", sm: "0 0 auto" } }} />
        ))}
      </Box>
    );
  }
  if (isError) {
    return <Box sx={{ p: 3, textAlign: "center" }}><Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>Couldn't load ads for this account.</Typography></Box>;
  }
  if (!ads || ads.length === 0) {
    return <Box sx={{ p: 3, textAlign: "center" }}><Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>No ads are currently running on this account.</Typography></Box>;
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, p: 2 }}>
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} fallbackPage={agentName ?? ""} adAccountId={adAccountId} />
      ))}
    </Box>
  );
}
