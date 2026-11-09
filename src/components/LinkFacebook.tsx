import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Autocomplete, Box, Button, TextField, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { listFbAdAccounts, listFbPages, type FbPage } from "../api/leadPages";
import { tokens } from "../theme";

// Linking a client's Facebook ad account and page, wherever it's asked for:
// pick from what EstateKit can see (theirs, by name, at the top) or paste
// the number. Used on the Overview card and in Settings, so it works the
// same in both places.

/** The number at the end of "Name · 1234", or the digits typed ("act_1234" too). */
const idFrom = (text: string) => text.match(/(\d+)\s*$/)?.[1] ?? text.replace(/\D/g, "");
const label = (o: FbPage) => (o.name && o.name !== o.id ? `${o.name} · ${o.id}` : `No name · ${o.id}`);

/** Theirs first: anything sharing a word of their name. */
function rank(list: FbPage[], clientName: string) {
  const words = clientName.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const mine = (o: FbPage) => words.some((w) => o.name.toLowerCase().includes(w));
  return [...list.filter(mine).map((o) => ({ ...o, group: "Looks like theirs" })), ...list.filter((o) => !mine(o)).map((o) => ({ ...o, group: "Everything EstateKit can see" }))];
}

function Picker({ title, help, options, loading, value, onChange, autoFocus }: {
  title: string; help: string; options: (FbPage & { group: string })[]; loading: boolean; value: string; onChange: (text: string) => void; autoFocus?: boolean;
}) {
  return (
    <Autocomplete
      freeSolo
      options={options}
      groupBy={(o) => (typeof o === "string" ? "" : o.group)}
      getOptionLabel={(o) => (typeof o === "string" ? o : label(o))}
      loading={loading}
      inputValue={value}
      onInputChange={(_e, v) => onChange(v)}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          autoFocus={autoFocus}
          label={title}
          placeholder={loading ? "Loading the list…" : "Pick one, or paste the number"}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {params.slotProps.input.endAdornment}
                  <Tooltip title={help}><InfoOutlinedIcon sx={{ fontSize: 18, color: tokens.ink3, mr: 0.5, cursor: "help" }} /></Tooltip>
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}

export default function LinkFacebook({ clientName, adAccountId, pageId, intro, onSave, onCancel, autoFocus }: {
  clientName: string;
  adAccountId: string | null;
  pageId: string | null;
  intro?: string;
  /** Saves; returns a problem to show, or nothing when saved. */
  onSave: (ad: string, page: string) => Promise<string | void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { data: accounts = [], isLoading: la } = useQuery({ queryKey: ["fbAdAccounts"], queryFn: listFbAdAccounts, staleTime: 30 * 60_000, retry: false });
  const { data: pages = [], isLoading: lp } = useQuery({ queryKey: ["fbPagesList"], queryFn: listFbPages, staleTime: 30 * 60_000, retry: false });
  const named = (list: FbPage[], id: string | null) => { const o = list.find((x) => x.id === id); return o ? label(o) : id ?? ""; };
  const [ad, setAd] = useState<string | null>(null);
  const [page, setPage] = useState<string | null>(null);
  const adText = ad ?? named(accounts, adAccountId);
  const pageText = page ?? named(pages, pageId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const a = idFrom(adText);
    const p = idFrom(pageText);
    if (adText.trim() && !a) return setErr("The ad account should be a number, or picked from the list.");
    if (pageText.trim() && !p) return setErr("The Facebook page should be a number, or picked from the list.");
    setBusy(true);
    setErr("");
    const problem = await onSave(a, p);
    setBusy(false);
    if (problem) setErr(problem);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {intro && <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{intro}</Typography>}
      <Picker
        title="Their ad account"
        help="Pick it from the list. Not there? Open their account in Ads Manager and copy the number after act= in the web address."
        options={rank(accounts, clientName)}
        loading={la}
        value={adText}
        onChange={(v) => setAd(v)}
        autoFocus={autoFocus}
      />
      <Picker
        title="Their Facebook page"
        help="The page their ads run from. Pick it from the list, or paste the page ID from the page's About section."
        options={rank(pages, clientName)}
        loading={lp}
        value={pageText}
        onChange={(v) => setPage(v)}
      />
      {err && <Typography role="alert" sx={{ fontSize: 13.5, color: tokens.red }}>{err}</Typography>}
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        {onCancel && <Button onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button variant="contained" disableElevation onClick={save} disabled={busy || (!adText.trim() && !pageText.trim())}>{busy ? "Saving…" : "Link"}</Button>
      </Box>
    </Box>
  );
}
