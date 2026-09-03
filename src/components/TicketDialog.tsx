import { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import { useSendTicket } from "../hooks/useSupport";
import { useSnack } from "../hooks/useSnack";

const TYPES = ["My ads / leads stopped", "An ad got rejected", "Something is broken", "Billing question", "Book a call / general question"];
const PRIORITIES = ["Whenever", "Soon", "Urgent — ads down"];

export default function TicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState(TYPES[0]);
  const [priority, setPriority] = useState(PRIORITIES[0]);
  const [message, setMessage] = useState("");
  const send = useSendTicket();
  const showSnack = useSnack();
  const posthog = usePostHog();

  async function submit() {
    if (!message.trim()) return;
    try {
      await send.mutateAsync({ type, priority, message: message.trim() });
      posthog.capture("support_ticket_submitted", { type, priority });
      showSnack("Sent — we'll get back to you shortly");
      setMessage("");
      onClose();
    } catch {
      showSnack("Could not send — try again");
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 18, fontWeight: 500, pb: 0.5 }}>Message us</DialogTitle>
      <Typography variant="body2" color="text.secondary" sx={{ px: 3, pb: 1.5 }}>
        Goes straight to our support team — we'll get back to you.
      </Typography>
      <DialogContent sx={{ pt: 0 }}>
        <TextField select fullWidth label="What do you need?" value={type} onChange={(e) => setType(e.target.value)} sx={{ mt: 1.5 }}>
          {TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Tell us a bit more"
          placeholder="Type what's happening…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          sx={{ mt: 2 }}
        />
        <TextField select fullWidth label="How urgent?" value={priority} onChange={(e) => setPriority(e.target.value)} sx={{ mt: 2 }}>
          {PRIORITIES.map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={send.isPending} onClick={submit}>
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}
