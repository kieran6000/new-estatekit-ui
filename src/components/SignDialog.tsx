import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, TextField } from "@mui/material";
import SignaturePad from "./SignaturePad";

// The one signature window, the way PDF signing apps do it: Draw, Type or Photo
// (signed on paper). Drawing is already open, so most people never choose.

type Way = "draw" | "type" | "photo";

const HAND_FONT = "Homemade Apple";
const HAND_FONT_URL = "https://fonts.googleapis.com/css2?family=Homemade+Apple&display=swap";
const INK = "#10203a";
/** Plenty for a signature, and within what the server takes. */
const MAX_PHOTO_WIDTH = 700;

/** The typed name in handwriting, as a picture, so it's stored like any other signature. */
async function typedSignature(name: string): Promise<string | null> {
  try {
    if (!document.querySelector(`link[href="${HAND_FONT_URL}"]`)) {
      await new Promise<void>((done) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = HAND_FONT_URL;
        link.onload = () => done();
        link.onerror = () => done();
        document.head.appendChild(link);
      });
    }
    await document.fonts.load(`48px "${HAND_FONT}"`, name);
  } catch { /* falls back to the device's handwriting font */ }
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  if (!g) return null;
  const font = `48px "${HAND_FONT}", cursive`;
  g.font = font;
  c.width = Math.ceil(g.measureText(name).width) + 60;
  c.height = 150;
  g.font = font;
  g.fillStyle = INK;
  g.textBaseline = "middle";
  g.fillText(name, 30, 75);
  return c.toDataURL("image/png");
}

/** A photo of a signature on paper: shrunk, with the paper made see-through so
 *  only the ink lands on the page. Null if the file can't be read as a picture. */
function photoSignature(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PHOTO_WIDTH / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = c.getContext("2d");
      if (!g) { resolve(null); return; }
      g.drawImage(img, 0, 0, c.width, c.height);
      const pixels = g.getImageData(0, 0, c.width, c.height);
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        const light = (d[i] + d[i + 1] + d[i + 2]) / 3;
        // Paper goes, ink stays, with a soft edge so it doesn't look cut out.
        d[i + 3] = light > 170 ? 0 : light > 120 ? Math.round(((170 - light) / 50) * 255) : 255;
      }
      g.putImageData(pixels, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.src = url;
  });
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** `askName` is for clients, who confirm their name. Typing is left out where
 *  the signature has to be the person's own handwriting (`handwrittenOnly`). */
export default function SignDialog({ title, action, name: startName, askName, handwrittenOnly, note, onCancel, onSign }: {
  title: string;
  action: string;
  name: string;
  askName?: boolean;
  handwrittenOnly?: boolean;
  note?: string;
  onCancel: () => void;
  onSign: (name: string, signature: string) => Promise<void>;
}) {
  const ways: { key: Way; label: string }[] = handwrittenOnly
    ? [{ key: "draw", label: "Draw" }, { key: "photo", label: "Photo" }]
    : [{ key: "draw", label: "Draw" }, { key: "type", label: "Type" }, { key: "photo", label: "Photo" }];
  const [way, setWay] = useState<Way>("draw");
  const [name, setName] = useState(startName);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (way !== "type") return;
    let gone = false;
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) { setTyped(null); return; }
    typedSignature(clean).then((png) => { if (!gone) setTyped(png); });
    return () => { gone = true; };
  }, [way, name]);

  const signature = way === "draw" ? drawn : way === "type" ? typed : photo;
  const ready = !!signature && (!askName || wordCount(name) >= 2);

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const png = await photoSignature(file);
    if (png) setPhoto(png);
    else setError("We couldn't read that picture. Try a different photo.");
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSign(name.trim().replace(/\s+/g, " "), signature!);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={busy ? undefined : onCancel} sx={{ "& .MuiDialog-paper": { m: 1.5, width: "calc(100% - 24px)" } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {askName && <TextField label="Your full name" fullWidth value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" sx={{ mt: 1, mb: 1 }} />}
        <Tabs value={way} onChange={(_e, v) => { setWay(v); setError(null); }} variant="fullWidth" sx={{ mb: 1.5 }}>
          {ways.map((w) => <Tab key={w.key} value={w.key} label={w.label} />)}
        </Tabs>

        {way === "draw" && <SignaturePad value={drawn} onChange={setDrawn} />}
        {way === "type" && (
          <div className="ct-pad-wrap">
            {typed ? <img className="ct-pad-picture" src={typed} alt={`Your name as a signature: ${name}`} /> : <div className="ct-pad-empty">Type your name above</div>}
          </div>
        )}
        {way === "photo" && (
          <div className="ct-pad-wrap">
            {photo && <img className="ct-pad-picture" src={photo} alt="Your signature" />}
            <div className="ct-pad-empty" style={photo ? { justifyContent: "flex-end" } : undefined}>
              {!photo && <span>Sign on paper and take a photo</span>}
              <Button variant={photo ? "text" : "outlined"} size={photo ? "small" : "medium"} onClick={() => picker.current?.click()}>{photo ? "Choose another" : "Choose a photo"}</Button>
            </div>
            <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        )}

        {note && <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.45 }}>{note}</p>}
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" disableElevation disabled={!ready || busy} onClick={submit}>{busy ? "Saving…" : action}</Button>
      </DialogActions>
    </Dialog>
  );
}
