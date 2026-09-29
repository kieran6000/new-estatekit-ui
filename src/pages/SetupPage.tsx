import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Skeleton,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { getMyProfile, upsertProfile, type AgentProfile } from "../api/agentProfile";
import { listMySoldListings } from "../api/soldListings";
import { useSnack } from "../hooks/useSnack";
import { trackActivity } from "../lib/activity";
import { isCellphone, isEmail, isFullName, SALES_TARGET, setupDone, setupProgress } from "../lib/setup";
import RecentSalesEditor from "../components/RecentSalesEditor";
import { MAX_IMAGE_BYTES, uploadImage } from "../lib/image";

type SaveState = "saving" | "saved" | "error" | null;

/** "Get set up": the six things sellers see (photo, recent sales, name,
 *  WhatsApp, email, agency), with a progress bar. Not a form: every answer
 *  saves on its own, and anything they can't do waits for the onboarding
 *  call. Works on the active agent, so an operator can fill it in with them. */
export default function SetupPage() {
  const qc = useQueryClient();
  const showSnack = useSnack();
  const { data: profile, isLoading } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile });
  const { data: sales = [] } = useQuery({ queryKey: ["mySold"], queryFn: listMySoldListings });
  const [saveState, setSaveState] = useState<SaveState>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [waConfirm, setWaConfirm] = useState<string | null>(null);
  // Bumped when a WhatsApp change is cancelled, to put the old number back in the box.
  const [waKey, setWaKey] = useState(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  async function save(patch: Partial<AgentProfile>) {
    if (!profile) return;
    setSaveState("saving");
    try {
      await upsertProfile(patch, profile.agentId);
      await Promise.all([qc.invalidateQueries({ queryKey: ["myProfile"] }), qc.invalidateQueries({ queryKey: ["clients"] })]);
      setSaveState("saved");
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState(null), 2500);
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
  }

  async function onPhoto(file: File | null) {
    if (!file || !profile) return;
    if (file.size > MAX_IMAGE_BYTES) { showSnack("That photo is too big. Try another one."); return; }
    setPhotoBusy(true);
    try {
      await save({ avatarUrl: await uploadImage(file, "photo", profile.agentId) });
      await qc.invalidateQueries({ queryKey: ["agentProfiles"] });
      showSnack("Photo added");
    } catch (e) {
      console.error(e);
      showSnack("Couldn't add the photo. Try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  if (isLoading || !profile) {
    return (
      <Box>
        <Header saveState={null} />
        <Box sx={{ maxWidth: 560, mx: "auto", mt: 3, px: 2 }}>
          <Skeleton variant="rounded" height={420} sx={{ borderRadius: "8px" }} />
        </Box>
      </Box>
    );
  }

  const input = {
    displayName: profile.displayName,
    company: profile.company,
    whatsappNumber: profile.whatsappNumber,
    email: profile.email,
    avatarUrl: profile.avatarUrl,
    salesCount: sales.length,
  };
  const done = setupDone(input);
  const progress = setupProgress(input);
  const initials = (profile.displayName || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Box>
      <Header saveState={saveState} />

      <Box sx={{ maxWidth: 560, mx: "auto", mt: 3, px: 2, pb: 8, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Progress */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 1 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 600 }}>
              {progress.complete ? "All done. Thank you!" : `${progress.done} of ${progress.total} done`}
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{Math.round((progress.done / progress.total) * 100)}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(progress.done / progress.total) * 100}
            color={progress.complete ? "success" : "primary"}
            sx={{ height: 10, borderRadius: 5 }}
          />
          <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1.25 }}>
            {progress.complete
              ? "Your page, your email and your sellers' plan are ready."
              : "Sellers see all of this. It saves as you go. Can't do one? Leave it, and we'll do it with you on your call."}
          </Typography>
        </Box>

        <Item n={1} done={done.photo} title="Your photo" why="Sellers trust a face. A clear, smiling photo of you works best.">
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Avatar src={profile.avatarUrl || undefined} sx={{ width: 72, height: 72, fontSize: 24, fontWeight: 600 }}>
              {initials}
            </Avatar>
            <Button
              component="label"
              variant={done.photo ? "outlined" : "contained"}
              disabled={photoBusy}
              startIcon={photoBusy ? <CircularProgress size={16} /> : <PhotoCameraOutlinedIcon />}
            >
              {photoBusy ? "Adding…" : done.photo ? "Change photo" : "Choose a photo"}
              <input type="file" hidden accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
            </Button>
          </Box>
        </Item>

        <Item
          n={2}
          done={done.sales}
          title={`${SALES_TARGET} homes you sold or listed recently`}
          why="They show on your page, in your email and in your sellers' plan. Real sales win sellers."
          status={done.sales ? undefined : `${sales.length} of ${SALES_TARGET} added`}
        >
          <RecentSalesEditor />
        </Item>

        <Item n={3} done={done.name} title="Your name" why="Your first and last name, the way sellers should see it.">
          <AutoSaveField
            label="Full name"
            value={profile.displayName}
            error={(v) => (v.trim() && !isFullName(v) ? "Add your surname too" : "")}
            onSave={(v) => save({ displayName: v })}
          />
        </Item>

        <Item n={4} done={done.whatsapp} title="Your WhatsApp number" why="It must be a cellphone. Every WhatsApp button, and your new-lead alerts, go to this number.">
          <AutoSaveField
            key={waKey}
            label="WhatsApp number"
            value={profile.whatsappNumber}
            inputMode="tel"
            error={(v) => (v.trim() && !isCellphone(v) ? "This doesn't look like a cellphone number" : "")}
            // A wrong number sends every lead to someone else, so it's confirmed first.
            onSave={(v) => setWaConfirm(v)}
          />
        </Item>

        <Item n={5} done={done.email} title="Email for replies" why="When a seller replies to your email, it comes here.">
          <AutoSaveField
            label="Email address"
            value={profile.email}
            inputMode="email"
            error={(v) => (v.trim() && !isEmail(v) ? "This doesn't look like an email address" : "")}
            onSave={(v) => save({ email: v })}
          />
        </Item>

        <Item n={6} done={done.agency} title="Your agency" why="Shown under your name, e.g. RE/MAX Midrand, or Independent.">
          <AutoSaveField label="Agency" value={profile.company} onSave={(v) => save({ company: v })} />
        </Item>
      </Box>

      <Dialog open={!!waConfirm} onClose={() => { setWaConfirm(null); setWaKey((k) => k + 1); }}>
        <DialogTitle>Is this the right WhatsApp number?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 15 }}>
            Sellers' WhatsApp messages and your new-lead alerts will go to <b>{waConfirm}</b>.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setWaConfirm(null); setWaKey((k) => k + 1); }}>No, keep the old one</Button>
          <Button
            variant="contained"
            onClick={() => {
              trackActivity("whatsapp_number_changed", { agentId: profile.agentId, detail: `${profile.whatsappNumber || "(none)"} → ${waConfirm}` });
              void save({ whatsappNumber: waConfirm ?? "" });
              setWaConfirm(null);
            }}
          >
            Yes, that's right
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Header({ saveState }: { saveState: SaveState }) {
  return (
    <AppBar position="sticky">
      <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
        <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Get set up</Typography>
        {saveState === "saving" && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Saving…</Typography>}
        {saveState === "saved" && (
          <Typography sx={{ fontSize: 13, color: "success.main", display: "flex", alignItems: "center", gap: 0.5 }}>
            <CheckIcon sx={{ fontSize: 17 }} /> Saved
          </Typography>
        )}
        {saveState === "error" && <Typography sx={{ fontSize: 13, color: "error.main" }}>Couldn't save. Try again.</Typography>}
      </Toolbar>
    </AppBar>
  );
}

function Item({ n, done, title, why, status, children }: { n: number; done: boolean; title: string; why: string; status?: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ borderColor: done ? "success.light" : undefined }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
          {done ? (
            <CheckCircleIcon sx={{ color: "success.main", fontSize: 26, mt: "1px" }} aria-label="Done" />
          ) : (
            <RadioButtonUncheckedIcon sx={{ color: "text.disabled", fontSize: 26, mt: "1px" }} aria-label="Not done yet" />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>
              {n}. {title}
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 0.25 }}>{why}</Typography>
            {status && <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "warning.dark", mt: 0.5 }}>{status}</Typography>}
          </Box>
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}

/** A text box that saves by itself: when they leave the box, or after they
 *  stop typing for a moment. Nothing saves while the answer looks wrong. */
function AutoSaveField({
  label,
  value,
  onSave,
  error,
  inputMode,
}: {
  label: string;
  value: string | null | undefined;
  onSave: (v: string) => void;
  error?: (v: string) => string;
  inputMode?: "tel" | "email" | "text";
}) {
  const [draft, setDraft] = useState(value || "");
  const [touched, setTouched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSaved = useRef(value || "");

  // A new value from the server (e.g. after a save, or a cancelled change).
  useEffect(() => {
    setDraft(value || "");
    lastSaved.current = value || "";
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const problem = error?.(draft) || "";

  function commit(v: string) {
    clearTimeout(timer.current);
    const next = v.trim();
    if (!next || next === lastSaved.current || error?.(next)) return;
    lastSaved.current = next;
    onSave(next);
  }

  return (
    <TextField
      label={label}
      value={draft}
      fullWidth
      inputMode={inputMode}
      type={inputMode === "email" ? "email" : "text"}
      error={touched && !!problem}
      helperText={touched && problem ? problem : " "}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        clearTimeout(timer.current);
        // The WhatsApp number is confirmed in a dialog, so only on leaving the box.
        if (inputMode !== "tel") timer.current = setTimeout(() => commit(v), 1200);
      }}
      onBlur={() => {
        setTouched(true);
        commit(draft);
      }}
    />
  );
}
