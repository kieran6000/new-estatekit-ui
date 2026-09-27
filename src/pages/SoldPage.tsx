import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { tokens } from "../theme";
import { supabase } from "../api/_client";
import { listSoldListingsForAgent } from "../api/soldListings";
import { SoldList } from "../components/SoldListings";
import { readableOn } from "../lib/contrast";

// Public page: an agent's recent sales. Linked from the confirmation email
// ("here are some homes I've sold recently") as proof while the lead waits.
// Branding comes from the agent's lead page (public), not their profile.

interface Brand {
  slug: string;
  agent_name: string;
  logo_data_url: string | null;
  accent_color: string;
}

async function brandFor(agentId: string): Promise<Brand | null> {
  const { data } = await supabase
    .from("lead_pages")
    .select("slug, agent_name, logo_data_url, accent_color")
    .eq("agent_id", agentId)
    .eq("source_type", "website")
    .order("created_at", { ascending: true })
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
  const accent = brand?.accent_color || "#1976d2";
  useEffect(() => {
    document.title = name ? `Recent sales by ${name}` : "Recent sales";
  }, [name]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ bgcolor: accent, color: readableOn(accent), p: "14px 20px", textAlign: "center", minHeight: 56 }}>
        {brand?.logo_data_url ? (
          <Box component="img" src={brand.logo_data_url} alt="" sx={{ height: 44, width: "auto", display: "inline-block", verticalAlign: "middle" }} />
        ) : (
          <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: "28px" }}>{name}</Typography>
        )}
      </Box>

      <Box sx={{ maxWidth: 520, mx: "auto", p: 2, pt: 3 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
          {name ? `Homes ${name.split(/\s+/)[0]} has sold recently` : "Recent sales"}
        </Typography>

        <Box sx={{ mt: 2 }}>
          {isLoading || brandLoading ? (
            <Skeleton variant="rounded" height={240} />
          ) : listings.length ? (
            <SoldList listings={listings} />
          ) : (
            <Typography sx={{ color: "text.secondary" }}>No recent sales to show yet.</Typography>
          )}
        </Box>

        {brand?.slug && (
          <Button
            href={`/p/${brand.slug}`}
            variant="contained"
            size="large"
            fullWidth
            sx={{ mt: 3, bgcolor: accent, color: readableOn(accent), "&:hover": { bgcolor: accent, filter: "brightness(0.9)" } }}
          >
            Get your free home evaluation
          </Button>
        )}
      </Box>
    </Box>
  );
}
