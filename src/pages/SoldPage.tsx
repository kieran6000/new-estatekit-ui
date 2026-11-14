import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Box, Button, Skeleton, Typography } from "@mui/material";
import { tokens } from "../theme";
import { supabase } from "../api/_client";
import { listSoldListingsForAgent } from "../api/soldListings";
import { SoldList } from "../components/SoldListings";
import { accentButton, readableOn } from "../lib/contrast";
import BrandLogo from "../components/BrandLogo";
import { prettyPhone } from "../lib/phone";

// Public page: an agent's recent sales. Linked from the confirmation email
// ("here are some homes I've sold recently") as proof while the lead waits.
// Branding comes from the agent's lead page (public), not their profile.
// An agent with no sales added yet still gets a useful page (links in
// automations can land here either way): who they are, what a valuation
// gives you, the button and their number. No made-up proof.

interface Brand {
  slug: string;
  agent_name: string;
  logo_data_url: string | null;
  accent_color: string;
  profile_photo_data_url: string | null;
  phone: string | null;
}

async function brandFor(agentId: string): Promise<Brand | null> {
  const { data } = await supabase
    .from("lead_pages")
    .select("slug, agent_name, logo_data_url, accent_color, profile_photo_data_url, phone")
    .eq("agent_id", agentId)
    .eq("source_type", "website")
    // The newest form: the one the agent set up most recently has their
    // current branding (an old first form can be bare).
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Brand) ?? null;
}

export default function SoldPage() {
  const { agentId = "" } = useParams();
  const valid = /^[0-9a-f-]{36}$/i.test(agentId);
  const { data: brand, isLoading: brandLoading } = useQuery({ queryKey: ["soldBrand", agentId], queryFn: () => brandFor(agentId), enabled: valid });
  const { data: listings = [], isLoading } = useQuery({ queryKey: ["publicSold", agentId], queryFn: () => listSoldListingsForAgent(agentId), enabled: valid });

  const name = brand?.agent_name?.trim() || "";
  const first = name.split(/\s+/)[0];
  const accent = brand?.accent_color || "#1976d2";
  const loading = isLoading || brandLoading;
  const none = !loading && !listings.length;
  const photo = brand?.profile_photo_data_url && /^(https:\/\/|data:image\/)/.test(brand.profile_photo_data_url) ? brand.profile_photo_data_url : undefined;
  const tel = (brand?.phone || "").replace(/[^\d+]/g, "");
  useEffect(() => {
    document.title = none ? name || "Your free home evaluation" : name ? `Recent sales by ${name}` : "Recent sales";
  }, [name, none]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ bgcolor: accent, color: readableOn(accent), p: "14px 20px", textAlign: "center", minHeight: 56 }}>
        {brand?.logo_data_url ? (
          <BrandLogo src={brand.logo_data_url} size={44} onColor={accent} />
        ) : (
          <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: "28px" }}>{name}</Typography>
        )}
      </Box>

      <Box sx={{ maxWidth: 520, mx: "auto", p: 2, pt: 3 }}>
        {loading ? (
          <Skeleton variant="rounded" height={240} />
        ) : none ? (
          <Box sx={{ bgcolor: "#fff", borderRadius: "14px", p: 3, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
            <Avatar src={photo} sx={{ width: 96, height: 96, mx: "auto", mb: 1.5, fontSize: 36, fontWeight: 700, bgcolor: accent, color: readableOn(accent) }}>
              {first[0]?.toUpperCase()}
            </Avatar>
            <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>{name || "Your free home evaluation"}</Typography>
            <Typography sx={{ fontSize: 15.5, color: "text.secondary", mt: 1.25 }}>
              {first || "Your agent"} will tell you what your home is realistically worth, based on what has actually sold near you. It's free, and you don't have to sell.
            </Typography>
          </Box>
        ) : (
          <>
            <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
              {first ? `Homes ${first} has sold recently` : "Recent sales"}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <SoldList listings={listings} />
            </Box>
          </>
        )}

        {brand?.slug && (
          <Button
            href={`/p/${brand.slug}`}
            variant="contained"
            size="large"
            fullWidth
            sx={{ mt: 3, ...accentButton(accent) }}
          >
            Get your free home evaluation
          </Button>
        )}
        {none && tel && (
          <Typography sx={{ textAlign: "center", fontSize: 15, mt: 2 }}>
            Or call {first || "me"}:{" "}
            <Box component="a" href={`tel:${tel}`} sx={{ color: "inherit", fontWeight: 700 }}>
              {prettyPhone(brand?.phone ?? "")}
            </Box>
          </Typography>
        )}
      </Box>
    </Box>
  );
}
