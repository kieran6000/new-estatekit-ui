import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Paper, TextField, Typography, useMediaQuery } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { cancelInvoice, createInvoice, deleteInvoice, InvoicesNotSetUp, listInvoices, markInvoicePaid, markInvoiceShared, type InvoiceRow } from "../api/invoices";
import { buildInvoice, DEFAULT_AMOUNT, DEFAULT_DESCRIPTION, DEFAULT_ITEM, DEFAULT_PERIOD, defaultDueDate, invoiceStatus, longDate, money, todaySA, whatsappDigits } from "../lib/invoiceTemplate";
import { useSnack } from "../hooks/useSnack";
import { timeAgo } from "../lib/timeAgo";
import { Row, Step, toneColours, when, type ContractClient } from "./ContractsSection";
import InvoiceSheet from "./InvoiceSheet";

const linkFor = (i: InvoiceRow) => `${window.location.origin}/i/${i.token}`;

function InvoiceCard({ i }: { i: InvoiceRow }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = invoiceStatus(i);
  const live = !i.voided_at;
  const openable = live && !i.paid_at;

  const refresh = () => qc.invalidateQueries({ queryKey: ["invoices"] });
  const shared = () => { if (!i.shared_at) markInvoiceShared(i.id).then(refresh).catch(() => {}); };
  const message = `Hi ${i.client_name.split(/\s+/)[0]}, your EstateKit invoice (${i.reference}) for ${money(i.amount)} is ready. It's due by ${longDate(i.due_date)}:\n${linkFor(i)}`;
  const sendOnWhatsApp = () => {
    window.open(`https://wa.me/${i.client_phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    shared();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(linkFor(i));
      showSnack("Link copied");
      shared();
    } catch {
      showSnack("Couldn't copy it. Open the invoice and copy the address from there.");
    }
  };
  const run = async (work: Promise<void>, done: string) => {
    try {
      await work;
      showSnack(done);
      refresh();
    } catch (e) {
      showSnack((e as Error).message);
    }
  };
  const cancel = async () => {
    await run(cancelInvoice(i.id), "Invoice cancelled");
    setConfirmCancel(false);
  };

  const remove = async () => {
    await run(deleteInvoice(i.id), "Invoice deleted");
    setConfirmDelete(false);
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: "6px", p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 500, fontSize: 15 }}>{money(i.amount)}</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{i.document.item} · {i.reference}</Typography>
        </Box>
        <Chip size="small" label={status.label} sx={{ ...toneColours[status.tone], fontWeight: 500, borderRadius: "4px" }} />
      </Box>

      {live && (
        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, rowGap: 0.5, mb: 1.5 }}>
          <Step done={!!i.shared_at} label="Sent" />
          <Step done={!!i.first_opened_at} label="Opened" />
          <Step done={!!i.paid_at} label="Paid" />
        </Box>
      )}

      <Box>
        <Row k="Due" v={longDate(i.due_date)} />
        {i.shared_at && <Row k="Sent" v={when(i.shared_at)} />}
        <Row k="Opened" v={i.first_opened_at ? `${i.open_count} ${i.open_count === 1 ? "time" : "times"}, last ${timeAgo(i.last_opened_at ?? i.first_opened_at)}` : "Not yet"} />
        {i.paid_at && <Row k="Paid" v={when(i.paid_at)} />}
        {i.voided_at && <Row k="Cancelled" v={when(i.voided_at)} />}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
        {openable && <Button size="small" variant="contained" disableElevation startIcon={<WhatsAppIcon />} onClick={sendOnWhatsApp}>Send on WhatsApp</Button>}
        {openable && <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={copy}>Copy link</Button>}
        <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} component="a" href={linkFor(i)} target="_blank" rel="noopener">View</Button>
        {openable && <Button size="small" onClick={() => run(markInvoicePaid(i.id, true), "Marked as paid")}>Mark as paid</Button>}
        {live && i.paid_at && <Button size="small" onClick={() => run(markInvoicePaid(i.id, false), "Marked as not paid")}>Mark as not paid</Button>}
        {openable && <Button size="small" color="error" onClick={() => setConfirmCancel(true)}>Cancel it</Button>}
        {i.voided_at && <Button size="small" color="error" onClick={() => setConfirmDelete(true)}>Delete</Button>}
      </Box>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel this invoice?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14 }}>{i.client_name} will see that it's cancelled and doesn't need paying. You can't undo this, but you can create a new one.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCancel(false)}>Keep it</Button>
          <Button color="error" onClick={cancel}>Cancel invoice</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete this invoice?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14 }}>{i.reference} will be gone for good, and its link will stop working.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
          <Button color="error" onClick={remove}>Delete invoice</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

const toNumber = (s: string) => Number(s.replace(/[^\d.]/g, ""));

/** Details, then a look at the real invoice, then create. */
function NewInvoiceDialog({ onClose, client }: { onClose: () => void; client: ContractClient }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const phone = useMediaQuery("(max-width:600px)");
  const [form, setForm] = useState({
    name: client.name, agency: client.company ?? "", phone: client.phone ?? "", email: client.email ?? "",
    item: DEFAULT_ITEM, description: DEFAULT_DESCRIPTION, period: DEFAULT_PERIOD, amount: String(DEFAULT_AMOUNT), dueDate: defaultDueDate(),
  });
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const amount = toNumber(form.amount);
  const today = todaySA();
  const phoneOk = !!whatsappDigits(form.phone);
  const complete = !!form.name.trim() && phoneOk && !!form.item.trim() && amount > 0 && form.dueDate >= today;
  const doc = useMemo(
    () => (previewing ? buildInvoice({ ...form, amount, issueDate: today }) : null),
    [previewing], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const create = async () => {
    if (!doc) return;
    setSaving(true);
    setError(null);
    try {
      await createInvoice(client.agentId, doc);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      showSnack("Invoice created. Send it on WhatsApp when you're ready.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={previewing ? "md" : "sm"} fullScreen={phone}>
      <DialogTitle>{previewing ? "Check the invoice" : "New invoice"}</DialogTitle>
      <DialogContent key={previewing ? "check" : "details"} className={previewing ? "inv-preview" : undefined} sx={previewing ? { bgcolor: "#3b3f42", p: { xs: 1, sm: 2 } } : undefined}>
        {previewing && doc ? (
          <InvoiceSheet doc={doc} reference="Given when created" />
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Their name" required value={form.name} onChange={set("name")} />
            <TextField label="Agency" value={form.agency} onChange={set("agency")} />
            <TextField label="WhatsApp number" required value={form.phone} onChange={set("phone")} error={!!form.phone && !phoneOk} helperText="The invoice link goes here, so check it's right." />
            <TextField label="Email" value={form.email} onChange={set("email")} />
            <TextField label="Item" required value={form.item} onChange={set("item")} />
            <TextField label="Description" value={form.description} onChange={set("description")} />
            <TextField label="Period" value={form.period} onChange={set("period")} helperText='For example "1 month" or "December 2026".' />
            <TextField label="Amount" required value={form.amount} onChange={set("amount")} slotProps={{ htmlInput: { inputMode: "decimal" }, input: { startAdornment: <InputAdornment position="start">R</InputAdornment> } }} />
            <TextField label="Due date" required type="date" value={form.dueDate} onChange={set("dueDate")} error={!!form.dueDate && form.dueDate < today} helperText={form.dueDate && form.dueDate < today ? "This date has already passed." : undefined} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }} />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        {previewing ? (
          <>
            <Button onClick={() => setPreviewing(false)} disabled={saving}>Back</Button>
            <Button variant="contained" disableElevation onClick={create} disabled={saving}>{saving ? "Creating…" : "Create invoice"}</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="contained" disableElevation disabled={!complete} onClick={() => setPreviewing(true)}>Next: check it</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** One client's invoices, under their contracts. */
export default function InvoicesSection({ client }: { client: ContractClient }) {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices", client.agentId],
    queryFn: () => listInvoices(client.agentId),
    retry: (n, e) => !(e instanceof InvoicesNotSetUp) && n < 1,
    refetchInterval: 60_000,
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxWidth: 720, width: "100%", mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600 }}>Invoices</Typography>
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setCreating(true)} disabled={!!error}>New invoice</Button>
      </Box>
      {isLoading && <CircularProgress size={24} sx={{ m: 2 }} />}
      {error && (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {error instanceof InvoicesNotSetUp ? "Invoices aren't switched on yet." : "Couldn't load the invoices. Refresh the page to try again."}
        </Typography>
      )}
      {data?.length === 0 && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>No invoices here yet.</Typography>}
      {data?.map((i) => <InvoiceCard key={i.id} i={i} />)}
      {creating && <NewInvoiceDialog onClose={() => setCreating(false)} client={client} />}
    </Box>
  );
}
