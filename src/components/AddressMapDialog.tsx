import { Box, Dialog, DialogContent, DialogTitle, IconButton, Link, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

/** The address on a clean Google map, with a pin (Google's own embed, so it
 *  needs no key). The street address is all they typed, so the search is
 *  "address, South Africa" to keep it from landing in another country. */
export default function AddressMapDialog({ address, open, onClose }: { address: string; open: boolean; onClose: () => void }) {
  const q = encodeURIComponent(/south africa/i.test(address) ? address : `${address}, South Africa`);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "flex-start", gap: 1, pr: 1 }}>
        <Typography component="span" sx={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{address}</Typography>
        <IconButton aria-label="Close" size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box
          component="iframe"
          title={`Map of ${address}`}
          src={open ? `https://www.google.com/maps?q=${q}&output=embed&z=17` : undefined}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sx={{ display: "block", width: "100%", height: { xs: 360, sm: 420 }, border: 0 }}
        />
        <Box sx={{ p: "10px 16px" }}>
          <Link href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener" sx={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            Open in Google Maps <OpenInNewIcon sx={{ fontSize: 15 }} />
          </Link>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
