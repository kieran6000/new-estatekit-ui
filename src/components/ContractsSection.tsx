import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { tokens } from "../theme";
import { cancelContract, ContractsNotSetUp, contractStatus, createContract, deviceName, getMySignature, listContractEvents, listContracts, markContractShared, readingTime, saveMySignature, type ContractRow } from "../api/contracts";
import { buildContract, CONTRACT_TITLE, DEFAULT_PLAN, MIN_AD_SPEND, PROVIDER_NAME, type ContractTerms } from "../lib/contractTemplate";
import { useSnack } from "../hooks/useSnack";
import { timeAgo } from "../lib/timeAgo";
import ContractSheet from "./ContractSheet";
import SignDialog from "./SignDialog";

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const linkFor = (c: ContractRow) => `${window.location.origin}/c/${c.token}`;
export const toneColours = {
  green: { color: tokens.greenDark, bgcolor: tokens.greenTint },
  blue: { color: tokens.primary, bgcolor: tokens.primaryBg },
  amber: { color: tokens.amber, bgcolor: tokens.amberTint },
  red: { color: tokens.red, bgcolor: tokens.redTint },
  grey: { color: tokens.ink2, bgcolor: tokens.surface2 },
};
const EVENT_LABEL: Record<string, string> = {
  created: "Contract created",
  sent_whatsapp: "Opened WhatsApp to send it",
  link_copied: "Link copied",
  opened: "Opened the contract",
  read_to_end: "Reached the end of the wording",
  code_sent: "Signing code sent to their WhatsApp",
  code_wrong: "Typed a wrong signing code",
  signed: "Signed",
  cancelled: "Cancelled",
};

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box sx={{ display: "flex", py: 1, borderTop: `1px solid ${tokens.divider2}`, gap: 1.5 }}>
      <Typography sx={{ color: "text.secondary", fontSize: 13, flex: "0 0 40%" }}>{k}</Typography>
      <Typography sx={{ fontSize: 14, flex: 1, minWidth: 0 }}>{v}</Typography>
    </Box>
  );
}

export function Step({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? CheckCircleIcon : RadioButtonUncheckedIcon;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: done ? tokens.greenDark : tokens.ink3 }}>
      <Icon sx={{ fontSize: 18 }} />
      <Typography sx={{ fontSize: 13, fontWeight: done ? 500 : 400, color: "inherit" }}>{label}</Typography>
    </Box>
  );
}

function History({ contractId }: { contractId: string }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ["contractEvents", contractId], queryFn: () => listContractEvents(contractId), staleTime: 30_000 });
  if (isLoading) return <CircularProgress size={20} sx={{ m: 1 }} />;
  if (isError) return <Typography sx={{ fontSize: 13, color: "text.secondary", py: 1 }}>Couldn't load the history. Refresh to try again.</Typography>;
  return (
    <Box>
      {data?.map((e) => (
        <Box key={e.id} sx={{ py: 1, borderTop: `1px solid ${tokens.divider2}` }}>
          <Typography sx={{ fontSize: 14 }}>{EVENT_LABEL[e.type] ?? e.type}{e.actor ? ` · ${e.actor}` : ""}</Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            {when(e.at)}{e.user_agent ? ` · ${deviceName(e.user_agent)}` : ""}{e.ip ? ` · ${e.ip}` : ""}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function ContractCard({ c, showClient }: { c: ContractRow; showClient: boolean }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const [history, setHistory] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const status = contractStatus(c);
  const openable = !c.signed_at && !c.voided_at;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["contracts"] });
    qc.invalidateQueries({ queryKey: ["contractEvents", c.id] });
  };
  const shared = (how: "whatsapp" | "copied") => markContractShared(c.id, how).then(refresh).catch(() => {});
  const first = c.signer_name.split(/\s+/)[0];
  const message = `Hi ${first}, your ${c.title} (${c.reference}) is ready to read and sign:\n${linkFor(c)}`;
  const sendOnWhatsApp = () => {
    window.open(`https://wa.me/${c.signer_phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    shared("whatsapp");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(linkFor(c));
      showSnack("Link copied");
      shared("copied");
    } catch {
      showSnack("Couldn't copy it. Open the contract and copy the address from there.");
    }
  };
  const cancel = async () => {
    try {
      await cancelContract(c.id);
      showSnack("Contract cancelled");
      refresh();
    } catch (e) {
      showSnack((e as Error).message);
    }
    setConfirmCancel(false);
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: "6px", p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 500, fontSize: 15 }}>{showClient ? c.signer_name : c.title}</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{showClient ? `${c.title} · ` : ""}{c.reference}</Typography>
        </Box>
        <Chip size="small" label={status.label} sx={{ ...toneColours[status.tone], fontWeight: 500, borderRadius: "4px" }} />
      </Box>

      {!c.voided_at && (
        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, rowGap: 0.5, mb: 1.5 }}>
          <Step done={!!c.shared_at} label="Sent" />
          <Step done={!!c.first_opened_at} label="Opened" />
          <Step done={!!c.read_to_end_at} label="Reached the end" />
          <Step done={!!c.signed_at} label="Signed" />
        </Box>
      )}

      <Box>
        {c.shared_at && <Row k="Sent" v={when(c.shared_at)} />}
        <Row k="Opened" v={c.first_opened_at ? `${c.open_count} ${c.open_count === 1 ? "time" : "times"}, last ${timeAgo(c.last_opened_at ?? c.first_opened_at)}` : "Not yet"} />
        {c.first_opened_at && <Row k="Time reading" v={readingTime(c.seconds_read)} />}
        {c.first_opened_at && <Row k="Scrolled through" v={`${c.max_scroll}% of the wording`} />}
        {c.signed_at && <Row k="Signed" v={`${when(c.signed_at)} by ${c.signed_name}`} />}
        {c.voided_at && <Row k="Cancelled" v={when(c.voided_at)} />}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
        {openable && <Button size="small" variant="contained" disableElevation startIcon={<WhatsAppIcon />} onClick={sendOnWhatsApp}>Send on WhatsApp</Button>}
        {openable && <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={copy}>Copy link</Button>}
        <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} component="a" href={linkFor(c)} target="_blank" rel="noopener">{c.signed_at ? "Signed copy" : "View"}</Button>
        <Button size="small" onClick={() => setHistory((h) => !h)}>{history ? "Hide history" : "History"}</Button>
        {openable && <Button size="small" color="error" onClick={() => setConfirmCancel(true)}>Cancel it</Button>}
      </Box>
      {history && <Box sx={{ mt: 1 }}><History contractId={c.id} /></Box>}

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel this contract?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14 }}>{c.signer_name} won't be able to read or sign it any more. You can't undo this, but you can create a new one.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCancel(false)}>Keep it</Button>
          <Button color="error" onClick={cancel}>Cancel contract</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export interface ContractClient {
  agentId: string;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  area?: string | null;
}

const toNumber = (s: string) => Number(s.replace(/[^\d.]/g, ""));

/** Details, then a look at the real document, then create. */
function NewContractDialog({ open, onClose, client, clients }: { open: boolean; onClose: () => void; client?: ContractClient; clients?: ContractClient[] }) {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const phone = useMediaQuery("(max-width:600px)");
  const [picked, setPicked] = useState<ContractClient | null>(client ?? null);
  const [form, setForm] = useState({
    name: client?.name ?? "", company: client?.company ?? "", phone: client?.phone ?? "", email: client?.email ?? "", area: client?.area ?? "",
    clientId: "", plan: DEFAULT_PLAN, ads: String(MIN_AD_SPEND),
  });
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pick = (id: string) => {
    const c = clients?.find((x) => x.agentId === id) ?? null;
    setPicked(c);
    if (c) setForm((f) => ({ ...f, name: c.name, company: c.company ?? "", phone: c.phone ?? "", email: c.email ?? "", area: c.area ?? "" }));
  };

  const terms: ContractTerms = {
    clientName: form.name, agency: form.company, clientId: form.clientId, email: form.email, targetAreas: form.area, plan: form.plan, minAdSpend: toNumber(form.ads),
  };
  const adsTooLow = !!form.ads && terms.minAdSpend < MIN_AD_SPEND;
  const complete = form.name.trim().split(/\s+/).length >= 2 && form.phone.replace(/\D/g, "").length >= 9 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && !!form.area.trim() && !!form.plan.trim() && terms.minAdSpend >= MIN_AD_SPEND;
  const doc = useMemo(() => (previewing ? buildContract(terms) : null), [previewing]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kieran's own handwriting, added once and on every contract after that.
  const { data: me } = useQuery({ queryKey: ["mySignature"], queryFn: getMySignature, staleTime: Infinity });
  const [signing, setSigning] = useState(false);
  const saveSignature = async (_name: string, png: string) => {
    await saveMySignature(png);
    qc.setQueryData(["mySignature"], { signature: png, canChange: true });
    setSigning(false);
  };
  const issuer = { name: PROVIDER_NAME, signature: me?.signature ?? null };

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await createContract({ agentId: picked?.agentId ?? null, title: CONTRACT_TITLE, signerName: form.name.trim(), company: form.company.trim(), phone: form.phone, email: form.email.trim(), document: { ...buildContract(terms), issuer } });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      showSnack("Contract created. Send it on WhatsApp when you're ready.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={previewing ? "md" : "sm"} fullScreen={phone}>
      <DialogTitle>{previewing ? "Check the contract" : "New contract"}</DialogTitle>
      <DialogContent key={previewing ? "check" : "details"} sx={previewing ? { bgcolor: "#3b3f42", p: { xs: 1, sm: 2 } } : undefined}>
        {previewing && doc ? (
          <ContractSheet
            doc={{ ...doc, issuer }}
            reference="Given when created"
            issuedAt={new Date().toISOString()}
            clientField={<div className="ct-field-empty">{form.name.trim()} signs here</div>}
            issuerField={me?.canChange
              ? <button type="button" className="ct-field" onClick={() => setSigning(true)}>Add your signature</button>
              : <div className="ct-field-empty">Kieran adds this once</div>}
          />
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {clients && (
              <TextField select label="Account" value={picked?.agentId ?? ""} onChange={(e) => pick(e.target.value)} helperText="Pick their account to fill in their details." slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                <MenuItem value="">Not on EstateKit yet</MenuItem>
                {clients.map((c) => <MenuItem key={c.agentId} value={c.agentId}>{c.name}</MenuItem>)}
              </TextField>
            )}
            <TextField label="Their full name" required value={form.name} onChange={set("name")} />
            <TextField label="Agency" value={form.company} onChange={set("company")} />
            <TextField label="WhatsApp number" required value={form.phone} onChange={set("phone")} helperText="Their signing link and signed copy go here, so check it's right." />
            <TextField label="Email" required value={form.email} onChange={set("email")} helperText="The agreement's notices go here." />
            <TextField label="Target areas" required value={form.area} onChange={set("area")} />
            <TextField label="Plan" required value={form.plan} onChange={set("plan")} />
            <TextField label="Minimum daily ad spend" required value={form.ads} onChange={set("ads")} error={adsTooLow} helperText={`At least R${MIN_AD_SPEND}.`} slotProps={{ htmlInput: { inputMode: "numeric" }, input: { startAdornment: <InputAdornment position="start">R</InputAdornment> } }} />
            <TextField label="ID or registration no." value={form.clientId} onChange={set("clientId")} helperText="Leave blank if you don't know it." />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {signing && <SignDialog title="Your signature" action="Save signature" name={issuer.name} handwrittenOnly onCancel={() => setSigning(false)} onSign={saveSignature} />}
      </DialogContent>
      <DialogActions>
        {previewing ? (
          <>
            {me?.signature && me.canChange && <Button onClick={() => setSigning(true)} disabled={saving} sx={{ mr: "auto" }}>Change my signature</Button>}
            <Button onClick={() => setPreviewing(false)} disabled={saving}>Back</Button>
            <Button variant="contained" disableElevation onClick={create} disabled={saving || !me?.signature}>{saving ? "Creating…" : "Create contract"}</Button>
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

/** One client's contracts (client) or everyone's (clients, the list to pick from). */
export default function ContractsSection({ client, clients, only, heading }: { client?: ContractClient; clients?: ContractClient[]; only?: (c: ContractRow) => boolean; heading?: string }) {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["contracts", client?.agentId ?? "all"],
    queryFn: () => listContracts(client?.agentId),
    retry: (n, e) => !(e instanceof ContractsNotSetUp) && n < 1,
    refetchInterval: 60_000,
  });
  const rows = only ? data?.filter(only) : data;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxWidth: 720, width: "100%", mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        {heading && <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{heading}</Typography>}
        <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => setCreating(true)} disabled={!!error}>New contract</Button>
      </Box>
      {isLoading && <CircularProgress size={24} sx={{ m: 2 }} />}
      {error && (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {error instanceof ContractsNotSetUp ? "Contracts aren't switched on yet." : "Couldn't load the contracts. Refresh the page to try again."}
        </Typography>
      )}
      {rows?.length === 0 && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>No contracts here yet.</Typography>}
      {rows?.map((c) => <ContractCard key={c.id} c={c} showClient={!client} />)}
      {creating && <NewContractDialog open onClose={() => setCreating(false)} client={client} clients={clients} />}
    </Box>
  );
}
