import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, Chip, CircularProgress, IconButton, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import { tokens } from "../theme";
import { supabase, getActiveAgentIdSync } from "../api/_client";
import { listMySoldListings, addSoldListing, deleteSoldListing, type SoldListingStatus } from "../api/soldListings";
import { trackActivity } from "../lib/activity";
import { useSnack } from "../hooks/useSnack";

/** The active agent's recent sales: list, remove, and add one (address,
 *  price, then a photo). Used on the Forms page and on Get set up. */
export default function RecentSalesEditor() {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: listings = [] } = useQuery({ queryKey: ["mySold"], queryFn: listMySoldListings });
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<SoldListingStatus>("sold");
  const [busy, setBusy] = useState(false);

  async function onImage(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showSnack("Image must be under 5 MB"); return; }
    if (!address.trim()) { showSnack("Add the address first"); return; }
    setBusy(true);
    try {
      const agentId = getActiveAgentIdSync() || "agent";
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${agentId}/sale-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) { console.error(error); showSnack("Couldn't upload the photo. Try again."); setBusy(false); return; }
      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
      const priceNum = price ? Number(price.replace(/\D/g, "")) : null;
      await addSoldListing({ imageUrl: urlData.publicUrl, address: address.trim(), price: priceNum, status });
      trackActivity("sold_listing_added", { sale: { address: address.trim(), price: priceNum ?? undefined } });
      await qc.invalidateQueries({ queryKey: ["mySold"] });
      await qc.invalidateQueries({ queryKey: ["publicSold"] });
      setAddress("");
      setPrice("");
      setStatus("sold");
      showSnack(status === "sold" ? "Sale added" : "Listing added");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await deleteSoldListing(id);
    await qc.invalidateQueries({ queryKey: ["mySold"] });
    await qc.invalidateQueries({ queryKey: ["publicSold"] });
    showSnack("Removed");
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
        Add the address and price, then pick a photo.
      </Typography>

      {listings.map((l) => (
        <Box key={l.id} sx={{ display: "flex", alignItems: "center", gap: 1.25, p: "8px 10px", border: `1px solid ${tokens.divider}`, borderRadius: "6px" }}>
          {l.imageUrl && <Box component="img" src={l.imageUrl} alt="" sx={{ width: 48, height: 40, objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Chip
                size="small"
                label={l.status === "sold" ? "Sold" : "Listed"}
                color={l.status === "sold" ? "success" : "primary"}
                variant="outlined"
                sx={{ height: 18, fontSize: 10.5, "& .MuiChip-label": { px: 0.75 } }}
              />
              <Typography sx={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.address}</Typography>
            </Box>
            {l.price != null && (
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {l.status === "sold" ? "Sold for" : "Listed at"} R{l.price.toLocaleString("en-ZA")}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => remove(l.id)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: "12px", border: `1px dashed ${tokens.divider}`, borderRadius: "6px" }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={status}
          onChange={(_e, v) => v && setStatus(v)}
          sx={{ alignSelf: "flex-start", "& .MuiToggleButton-root": { textTransform: "none", fontSize: 12.5, px: 1.5, py: 0.5 } }}
        >
          <ToggleButton value="sold">Sold</ToggleButton>
          <ToggleButton value="listed">Listed</ToggleButton>
        </ToggleButtonGroup>
        <TextField label="Address" size="small" value={address} onChange={(e) => setAddress(e.target.value)} fullWidth placeholder="e.g. 12 Protea Drive, Midrand" />
        <TextField
          label={status === "sold" ? "Sold price (R)" : "Listed price (R)"}
          size="small"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
          fullWidth
          placeholder="e.g. 1970000"
          inputMode="numeric"
        />
        <Button component="label" variant="contained" size="small" disabled={busy || !address.trim()} startIcon={busy ? <CircularProgress size={14} /> : <AddIcon fontSize="small" />} sx={{ alignSelf: "flex-start" }}>
          {busy ? "Adding…" : `Add ${status} home (pick photo)`}
          <input type="file" hidden accept="image/*" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
        </Button>
      </Box>
    </Box>
  );
}
