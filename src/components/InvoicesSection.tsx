import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Menu, MenuItem, Paper, TextField, Typography, useMediaQuery } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { cancelInvoice, createInvoice, deleteInvoice, InvoicesNotSetUp, listInvoices, markInvoicePaid, markInvoiceShared, type InvoiceRow } from "../api/invoices";
import { buildInvoice, DEFAULT_AMOUNT, DEFAULT_DESCRIPTION, DEFAULT_ITEM, DEFAULT_PERIOD, defaultDueDate, INVOICE_PLANS, instalmentItem, invoiceStatus, longDate, MIN_DAILY_AD_SPEND, money, QUARTER_HALF, todaySA, whatsappDigits, type Instalment, type InvoicePlan } from "../lib/invoiceTemplate";
import { useSnack } from "../hooks/useSnack";
import { tokens } from "../theme";
import { toneColours, type ContractClient } from "./ContractsSection";
import InvoiceSheet from "./InvoiceSheet";

const linkFor = (i: InvoiceRow) => `${window.location.origin}/i/${i.token}`;

const COLUMNS = { xs: "minmax(0, 1fr) auto 40px", sm: "120px minmax(0, 1fr) 100px 170px 40px" };
const shortDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric" });

function InvoiceListRow({ i }: { i: InvoiceRow }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const status = invoiceStatus(i);
  const live = !i.voided_at;
  const openable = live && !i.paid_at;
  const detail = i.paid_at
    ? `On ${shortDate(i.paid_at)}`
    : i.voided_at
      ? `On ${shortDate(i.voided_at)}`
      : i.first_opened_at
        ? `Opened ${i.open_count} ${i.open_count === 1 ? "time" : "times"}`
        : i.shared_at
          ? `Sent ${shortDate(i.shared_at)}`
          : null;

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
    <Box sx={{ display: "grid", gridTemplateColumns: COLUMNS, columnGap: 1.5, alignItems: "center", py: 1.25, px: 2, borderTop: `1px solid ${tokens.divider2}` }}>
      <Typography sx={{ display: { xs: "none", sm: "block" }, fontSize: 14 }}>{longDate(i.due_date)}</Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{i.document.item}</Typography>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{i.reference}</Typography>
        <Typography sx={{ display: { sm: "none" }, fontSize: 12.5, color: "text.secondary" }}>Due {longDate(i.due_date)}</Typography>
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: "tabular-nums", textAlign: { xs: "right", sm: "left" } }}>{money(i.amount)}</Typography>
      <Box sx={{ gridRow: { xs: 2, sm: "auto" }, gridColumn: { xs: "1 / -1", sm: "auto" }, mt: { xs: 0.5, sm: 0 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 8, height: 8, flex: "none", borderRadius: "50%", bgcolor: toneColours[status.tone].color }} />
          <Typography sx={{ fontSize: 14 }}>{status.label}</Typography>
        </Box>
        {detail && <Typography sx={{ fontSize: 12.5, color: "text.secondary", pl: "14px" }}>{detail}</Typography>}
      </Box>
      <IconButton aria-label={`Options for ${i.reference}`} size="small" onClick={(e) => setMenu(e.currentTarget)} sx={{ gridColumn: { xs: 3, sm: "auto" }, gridRow: { xs: 1, sm: "auto" } }}>
        <MoreHorizIcon />
      </IconButton>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} onClick={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {openable && <MenuItem onClick={sendOnWhatsApp}>Send on WhatsApp</MenuItem>}
        {openable && <MenuItem onClick={copy}>Copy link</MenuItem>}
        <MenuItem component="a" href={linkFor(i)} target="_blank" rel="noopener">View invoice</MenuItem>
        {openable && <MenuItem onClick={() => run(markInvoicePaid(i.id, true), "Marked as paid")}>Mark as paid</MenuItem>}
        {live && i.paid_at && <MenuItem onClick={() => run(markInvoicePaid(i.id, false), "Marked as not paid")}>Mark as not paid</MenuItem>}
        {openable && <MenuItem onClick={() => setConfirmCancel(true)} sx={{ color: "error.main" }}>Cancel it</MenuItem>}
        {i.voided_at && <MenuItem onClick={() => setConfirmDelete(true)} sx={{ color: "error.main" }}>Delete</MenuItem>}
      </Menu>

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
    </Box>
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
    item: DEFAULT_ITEM as string, description: DEFAULT_DESCRIPTION, period: DEFAULT_PERIOD as string, amount: String(DEFAULT_AMOUNT), dueDate: defaultDueDate(),
    plan: "monthly" as InvoicePlan, adSpendOn: "no", adSpend: String(MIN_DAILY_AD_SPEND * INVOICE_PLANS.monthly.days),
    /** 3-month package: "full", or which of 2 payments this invoice is. */
    pay: "full" as "full" | "1" | "2",
  });
  /** Ad spend to start from: the minimum for the days this invoice covers. */
  const startAdSpend = (plan: InvoicePlan, split: boolean) => String(MIN_DAILY_AD_SPEND * INVOICE_PLANS[plan].days / (split ? 2 : 1));
  /** 3-month package: in full, or payment 1 or 2 of 2 (half each). */
  const pickPay = (pay: "full" | "1" | "2") => {
    const split = pay !== "full";
    setForm((f) => ({
      ...f, pay,
      item: split ? instalmentItem(Number(pay) as Instalment) : INVOICE_PLANS.quarter.item,
      amount: String(split ? QUARTER_HALF : INVOICE_PLANS.quarter.amount),
      adSpend: startAdSpend("quarter", split),
    }));
  };
  /** Picking a plan fills in its item, period, price and a starting ad spend. */
  const pickPlan = (plan: InvoicePlan) => {
    const p = INVOICE_PLANS[plan];
    setForm((f) => ({ ...f, plan, pay: "full", item: p.item, period: p.period, amount: String(p.amount), adSpend: startAdSpend(plan, false) }));
  };
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const amount = toNumber(form.amount);
  const adSpend = form.adSpendOn === "yes" ? toNumber(form.adSpend) : 0;
  const today = todaySA();
  const phoneOk = !!whatsappDigits(form.phone);
  const complete = !!form.name.trim() && phoneOk && !!form.item.trim() && amount > 0 && (form.adSpendOn === "no" || adSpend > 0) && form.dueDate >= today;
  const doc = useMemo(
    () => (previewing ? buildInvoice({ ...form, amount, adSpend, issueDate: today, instalment: form.plan === "quarter" && form.pay !== "full" ? (Number(form.pay) as Instalment) : undefined }) : null),
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
            <TextField select label="Plan" required value={form.plan} onChange={(e) => pickPlan(e.target.value as InvoicePlan)}>
              {(Object.keys(INVOICE_PLANS) as InvoicePlan[]).map((k) => <MenuItem key={k} value={k}>{INVOICE_PLANS[k].label}</MenuItem>)}
            </TextField>
            {form.plan === "quarter" && (
              <TextField select label="How they pay" required value={form.pay} onChange={(e) => pickPay(e.target.value as "full" | "1" | "2")}
                helperText={form.pay === "full" ? undefined : `Half now, half 30 days after launch. This invoice is payment ${form.pay} of 2.`}>
                <MenuItem value="full">In full: {money(INVOICE_PLANS.quarter.amount)}</MenuItem>
                <MenuItem value="1">2 payments: this is payment 1 of 2 (before launch)</MenuItem>
                <MenuItem value="2">2 payments: this is payment 2 of 2 (30 days after launch)</MenuItem>
              </TextField>
            )}
            <TextField label="Fee" required value={form.amount} onChange={set("amount")} slotProps={{ htmlInput: { inputMode: "decimal" }, input: { startAdornment: <InputAdornment position="start">R</InputAdornment> } }} />
            <TextField select label="Ad spend" required value={form.adSpendOn} onChange={set("adSpendOn")}>
              <MenuItem value="no">Not on this invoice: they pay Meta directly</MenuItem>
              <MenuItem value="yes">On this invoice: we pay Meta for them</MenuItem>
            </TextField>
            {form.adSpendOn === "yes" && (
              <TextField label="Ad spend amount" required value={form.adSpend} onChange={set("adSpend")}
                helperText={(() => { const days = INVOICE_PLANS[form.plan].days / (form.plan === "quarter" && form.pay !== "full" ? 2 : 1); return `R${MIN_DAILY_AD_SPEND} a day × ${days} days = ${money(MIN_DAILY_AD_SPEND * days)} at the minimum. Paid to Meta at cost.`; })()}
                slotProps={{ htmlInput: { inputMode: "decimal" }, input: { startAdornment: <InputAdornment position="start">R</InputAdornment> } }} />
            )}
            {(amount > 0 || adSpend > 0) && <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Total due: {money(amount + adSpend)}</Typography>}
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
      {!!data?.length && (
        <Paper variant="outlined" sx={{ borderRadius: "8px", overflow: "hidden" }}>
          <Box sx={{ display: { xs: "none", sm: "grid" }, gridTemplateColumns: COLUMNS, columnGap: 1.5, px: 2, py: 1 }}>
            {["Due date", "Item", "Amount", "Status"].map((h) => <Typography key={h} sx={{ fontSize: 13, fontWeight: 600 }}>{h}</Typography>)}
          </Box>
          {data.map((i) => <InvoiceListRow key={i.id} i={i} />)}
        </Paper>
      )}
      {creating && <NewInvoiceDialog onClose={() => setCreating(false)} client={client} />}
    </Box>
  );
}
