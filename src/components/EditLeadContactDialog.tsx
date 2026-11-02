import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { updateLead } from "../api/leads";
import { useSnack } from "../hooks/useSnack";
import type { LeadRow } from "../types";

// Fix a lead's name, number or email (a typo in the form, a nickname, a
// second number they gave on the phone). The phone is left out for plans
// that only see masked numbers.
export default function EditLeadContactDialog({ lead, open, onClose, showPhone }: {
  lead: LeadRow; open: boolean; onClose: () => void; showPhone: boolean;
}) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone);
  const [email, setEmail] = useState(lead.email ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(lead.name);
    setPhone(lead.phone);
    setEmail(lead.email ?? "");
  }, [open, lead.id]);

  const phoneOk = !showPhone || phone.replace(/\D/g, "").length >= 9;
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave = name.trim().length > 0 && phoneOk && emailOk && !saving;

  async function save() {
    setSaving(true);
    try {
      await updateLead(lead.id, {
        name: name.trim(),
        email: email.trim() || null,
        ...(showPhone ? { phone: phone.trim() } : {}),
      });
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      showSnack("Saved");
      onClose();
    } catch (e) {
      console.error(e);
      showSnack("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Edit contact details</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth />
        {showPhone && (
          <TextField
            label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={!phoneOk}
            helperText={phoneOk ? " " : "That number looks too short."}
            inputMode="tel"
            fullWidth
          />
        )}
        <TextField
          label="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!emailOk}
          helperText={emailOk ? " " : "That email doesn't look right."}
          inputMode="email"
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => void save()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
