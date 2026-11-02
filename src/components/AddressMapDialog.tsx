import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

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
          src={open ? `https://www.google.com/maps?q=${q}&output=embed&t=m&z=17` : undefined}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sx={{ display: "block", width: "100%", height: { xs: 360, sm: 420 }, border: 0 }}
        />
        <Box sx={{ p: "10px 16px" }}>
          <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
            The pin shows the most likely spot for the address they typed. It may not be the exact house, so confirm it with them.
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
