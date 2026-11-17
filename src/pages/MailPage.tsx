import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppBar, Avatar, Box, Button, Checkbox, CircularProgress, Divider,
  IconButton, InputBase, MenuItem, Select, Tab, Tabs, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ReplyIcon from "@mui/icons-material/Reply";
import ReplyAllIcon from "@mui/icons-material/ReplyAll";
import ForwardIcon from "@mui/icons-material/Forward";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import SignatureIcon from "@mui/icons-material/DriveFileRenameOutline";
import DoneIcon from "@mui/icons-material/Done";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { tokens } from "../theme";
import { useSnack } from "../hooks/useSnack";
import { getDraft } from "../lib/mailDraft";
import { openCompose } from "../lib/composeWindow";
import {
  attIcon, b64ToBytes, Body, emailIn, esc, fmtSize, plainText, SignatureDialog, LAST_MB,
} from "../components/MailCompose";
import { useMailUnreadByBox } from "../components/MailBits";
import { listWorkflowEmails, type SentEmail } from "../api/workflowEmails";
import {
  getAttachment, getThread, listMailboxes, listThreads, MailNotConnected, modifyThread, runBounceCheck,
  sentStatus,
  type Folder, type MessageFull, type SentStatus, type ThreadSummary,
} from "../api/mail";

/** How many days of EstateKit's own automated mail show up in Sent alongside
 *  the mail the team typed out themselves. */
const AUTO_DAYS = 30;
/** Workflow mail carries this in front of its id, so one list and one URL can
 *  hold both kinds of row without them ever being confused. */
const AUTO = "auto:";

function timeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function timeFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const initials = (s: string) => (s.trim()[0] || "?").toUpperCase();

// ── Sender avatar: a tidy coloured monogram, the same colour for the same
// person every time (same idea as WhatsApp). No blue, per house style. ──────
const AV_COLORS = ["#5b6b5a", "#7a5c48", "#6b5b7a", "#4f6d6a", "#7a6b4f", "#6a5151", "#4f6a52", "#605a6e"];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function SenderAvatar({ name, email, size = 36 }: { name: string; email: string; size?: number }) {
  return (
    <Avatar sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: avatarColor(email || name), color: "#fff", flexShrink: 0 }}>
      {initials(name)}
    </Avatar>
  );
}

// ── Attachments ─────────────────────────────────────────────────────────────
const isViewable = (mime: string) => /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp))/i.test(mime);

/** A received attachment: tap to open (PDF/image in a tab) or download. */
function AttachmentChip({ mailbox, messageId, att }: { mailbox: string; messageId: string; att: MessageFull["attachments"][number] }) {
  const [busy, setBusy] = useState(false);
  const snack = useSnack();
  const open = async () => {
    if (busy) return;
    if (att.size > 18 * 1024 * 1024) {
      snack("That file is too big to open here. Open this email in Gmail to get it.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await getAttachment(mailbox, messageId, att.attachmentId);
      const blob = new Blob([b64ToBytes(data) as BlobPart], { type: att.mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      if (isViewable(att.mimeType)) {
        window.open(url, "_blank", "noopener");
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = att.filename || "attachment"; a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      snack("Couldn't open that file. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box
      onClick={open}
      role="button"
      sx={{
        display: "inline-flex", alignItems: "center", gap: 0.75, maxWidth: 260, cursor: "pointer", minHeight: 44,
        border: `1px solid ${tokens.divider}`, borderRadius: 1.5, px: 1, py: 0.6, bgcolor: "background.paper",
        "&:hover": { bgcolor: tokens.hover },
      }}
    >
      {busy ? <CircularProgress size={16} /> : attIcon(att.mimeType)}
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink, lineHeight: 1.2 }}>{att.filename || "attachment"}</Typography>
        <Typography sx={{ fontSize: 10.5, color: tokens.ink3, lineHeight: 1.2 }}>
          {isViewable(att.mimeType) ? "Open" : "Download"}{att.size ? ` · ${fmtSize(att.size)}` : ""}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Delivery ticks, read the same way as WhatsApp's ─────────────────────────
/** How long we wait before calling a mail delivered. Email has no "delivered"
 *  receipt — what it has is a bounce coming back, usually within seconds. So
 *  once a few minutes have passed with nothing bounced, it reached them. */
const SETTLED_MS = 15 * 60_000;

/** Reads one of our sent mails into the four tick states. */
function tickState(st: SentStatus) {
  return {
    bounced: !!st.bounced_at,
    opened: !!st.opened_at,
    clicked: !!st.clicked_at,
    delivered: !st.bounced_at && Date.now() - new Date(st.sent_at).getTime() > SETTLED_MS,
  };
}

function Ticks({ delivered, opened, clicked, bounced, ours, who }: {
  delivered: boolean; opened: boolean; clicked: boolean; bounced: boolean;
  /** Mail we sent by hand from this inbox — the wording is a little different,
   *  because the opens come from a picture the reader can switch off. */
  ours?: boolean; who?: string | null;
}) {
  if (bounced) {
    const extra = ours && who ? ` It couldn't be delivered to ${who}.` : "";
    return (
      <Tooltip title={`It didn't arrive. The address bounced it back, or it was marked as spam.${extra}`}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color: tokens.red }}>
          <ReportProblemOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 600 }}>Didn't arrive</Typography>
        </Box>
      </Tooltip>
    );
  }
  if (ours) {
    const word = clicked ? "Tapped a link" : opened ? "Opened" : delivered ? "Delivered" : "Sent";
    const help = clicked
      ? "They opened it and tapped a link inside it."
      : opened
        ? "They opened it. Some people read mail with pictures switched off, so this can stay on Delivered even when they have read it."
        : delivered
          ? "Nothing came back undelivered, so it reached them. No sign yet that they've opened it."
          : "It's on its way. If it can't be delivered, this turns red within a few minutes.";
    const lit = opened || clicked;
    return (
      <Tooltip title={help}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color: lit ? tokens.primary : tokens.ink3 }}>
          {delivered || lit ? <DoneAllIcon sx={{ fontSize: 16 }} /> : <DoneIcon sx={{ fontSize: 16 }} />}
          {clicked && <TouchAppOutlinedIcon sx={{ fontSize: 14 }} />}
          <Typography sx={{ fontSize: 11.5, fontWeight: lit ? 600 : 400 }}>{word}</Typography>
        </Box>
      </Tooltip>
    );
  }
  const word = clicked ? "Tapped a link" : opened ? "Opened" : delivered ? "Delivered" : "Sent";
  const help = clicked
    ? "They opened it and tapped a link inside."
    : opened
      ? "They opened it."
      : delivered
        ? "It reached their inbox. No sign they've opened it yet."
        : "It left our side. Waiting for the delivery report.";
  const lit = opened || clicked;
  return (
    <Tooltip title={help}>
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color: lit ? tokens.primary : tokens.ink3 }}>
        {delivered || lit ? <DoneAllIcon sx={{ fontSize: 16 }} /> : <DoneIcon sx={{ fontSize: 16 }} />}
        {clicked && <TouchAppOutlinedIcon sx={{ fontSize: 14 }} />}
        <Typography sx={{ fontSize: 11.5, fontWeight: lit ? 600 : 400 }}>{word}</Typography>
      </Box>
    </Tooltip>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
/** One line in Sent: an email someone wrote, or one a workflow sent. */
type SentItem =
  | { id: string; date: string; kind: "thread"; t: ThreadSummary }
  | { id: string; date: string; kind: "auto"; e: SentEmail };

export default function MailPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const snack = useSnack();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [params, setParams] = useSearchParams();
  const [mailbox, setMailbox] = useState<string>(() => params.get("box") || localStorage.getItem(LAST_MB) || "");
  const [folder, setFolder] = useState<Folder>(() => (params.get("folder") as Folder) || "inbox");
  const [selected, setSelected] = useState<string | null>(() => params.get("thread"));
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sigOpen, setSigOpen] = useState(false);
  // The emails ticked off in the list, for doing several at once.
  const [picks, setPicks] = useState<string[]>([]);

  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: listMailboxes, staleTime: 5 * 60_000 });
  const mbList = mailboxes.data ?? [];
  // So the picker says which inbox the waiting mail is in, not just that some exists.
  const unreadByBox = useMailUnreadByBox();
  const currentMb = useMemo(() => mbList.find((m) => m.email === mailbox) ?? mbList[0], [mbList, mailbox]);

  useEffect(() => { if (!mailbox && mbList.length) setMailbox(mbList[0].email); }, [mbList, mailbox]);
  useEffect(() => { if (currentMb) localStorage.setItem(LAST_MB, currentMb.email); }, [currentMb]);

  // Deep links: ?box=…&folder=…&thread=…, plus ?to=…&subject=…&body=… to open
  // a part-written email, and ?draft=1 to pick the saved one back up.
  const wantDraft = params.get("draft");
  const wantTo = params.get("to");
  useEffect(() => {
    const next = new URLSearchParams(params);
    let changed = false;
    if (wantDraft) {
      const stored = getDraft();
      if (stored) {
        openCompose({ ...stored, rich: true }, stored.mailbox);
        if (stored.mailbox) setMailbox(stored.mailbox);
      } else {
        snack("That draft is gone — nothing was saved.");
      }
      next.delete("draft");
      changed = true;
    } else if (wantTo !== null) {
      openCompose({ to: wantTo, cc: params.get("cc") ?? "", subject: params.get("subject") ?? "", body: params.get("body") ?? "" }, mailbox || undefined);
      ["to", "cc", "subject", "body"].forEach((k) => next.delete(k));
      changed = true;
    }
    if (changed) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantDraft, wantTo]);

  // Keep the URL in step with what's on screen, so any view can be shared.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (currentMb) next.set("box", currentMb.email); else next.delete("box");
    next.set("folder", folder);
    if (selected) next.set("thread", selected); else next.delete("thread");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMb, selected, folder]);

  const threads = useQuery({
    queryKey: ["mailThreads", currentMb?.email, folder, search],
    queryFn: () => listThreads(currentMb!.email, folder, search || undefined),
    enabled: !!currentMb,
    staleTime: 30_000,
    // A reply that comes in while the page is open should just appear, the way
    // it does in Gmail — nobody should have to press refresh to see it.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const isAuto = !!selected?.startsWith(AUTO);
  const thread = useQuery({
    queryKey: ["mailThread", currentMb?.email, selected],
    queryFn: () => getThread(currentMb!.email, selected!),
    enabled: !!currentMb && !!selected && !isAuto,
  });

  // The emails EstateKit sends on its own — nurture, follow-ups. They went out
  // in the team's name, so they belong in Sent with everything else, not in a
  // tab of their own.
  const autoMail = useQuery({
    queryKey: ["workflowEmails", AUTO_DAYS],
    queryFn: () => listWorkflowEmails(AUTO_DAYS),
    enabled: folder === "sent" && !search,
    staleTime: 60_000,
    retry: false,
  });
  const autoRows = useMemo(() => (folder === "sent" && !search ? autoMail.data ?? [] : []), [autoMail.data, folder, search]);
  const autoById = useMemo(() => new Map(autoRows.map((e) => [AUTO + e.id, e])), [autoRows]);

  /** Sent, in one list: what the team typed, and what the workflows sent, newest first. */
  const sentItems = useMemo((): SentItem[] => {
    const mine: SentItem[] = (threads.data?.threads ?? []).map((t) => ({ id: t.id, date: t.date, kind: "thread", t }));
    const auto: SentItem[] = autoRows.map((e) => ({ id: AUTO + e.id, date: e.sent_at, kind: "auto", e }));
    return [...mine, ...auto].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [threads.data, autoRows]);

  // Ticks for the mail we sent. Gmail reports nothing once a mail has gone, so
  // this is our own tracking: a hidden picture for opens, our own redirect for
  // taps, and a sweep of the bounce reports for mail that didn't arrive.
  const tickIds = useMemo(() => {
    const ids = (threads.data?.threads ?? []).map((t) => t.id);
    if (selected && !selected.startsWith(AUTO) && !ids.includes(selected)) ids.push(selected);
    return ids;
  }, [threads.data, selected]);
  const ticks = useQuery({
    queryKey: ["mailTicks", currentMb?.email, tickIds.join(",")],
    queryFn: async () => {
      // Checking for bounces means reading the mailer-daemon mail, so only do
      // it where it shows: the Sent list and an open conversation.
      if (folder === "sent" || selected) await runBounceCheck(currentMb!.email);
      return sentStatus(currentMb!.email, tickIds);
    },
    enabled: !!currentMb && tickIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const tickByMsg = useMemo(() => {
    const m = new Map<string, SentStatus>();
    for (const r of ticks.data?.rows ?? []) if (r.gmail_id) m.set(r.gmail_id, r);
    return m;
  }, [ticks.data]);
  const tickByThread = useMemo(() => {
    // One line per thread in the list: the latest mail we sent in it.
    const m = new Map<string, SentStatus>();
    for (const r of ticks.data?.rows ?? []) {
      if (!r.thread_id) continue;
      const prev = m.get(r.thread_id);
      if (!prev || r.sent_at > prev.sent_at) m.set(r.thread_id, r);
    }
    return m;
  }, [ticks.data]);

  const notConnected = threads.error instanceof MailNotConnected;

  const act = useMutation({
    mutationFn: ({ id, change }: { id: string; change: { archive?: boolean; unarchive?: boolean; read?: boolean; notJunk?: boolean } }) =>
      modifyThread(currentMb!.email, id, change),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["mailThreads"] });
      qc.invalidateQueries({ queryKey: ["mailUnread"] });
      setSelected(null);
      snack(
        v.change.notJunk ? "Moved to the inbox. Google will learn from that."
          : v.change.unarchive ? "Back in the inbox."
            : v.change.archive ? "Archived. Find it under Archive or All mail."
              : "Done.",
      );
    },
    onError: () => snack("That didn't go through. Try again."),
  });

  /** The same thing, done to everything ticked. One after the other rather
   *  than all at once — Gmail is happier, and a handful of emails is quick. */
  const bulk = useMutation({
    mutationFn: async ({ ids, change }: { ids: string[]; change: { archive?: boolean; unarchive?: boolean; read?: boolean; notJunk?: boolean } }) => {
      for (const id of ids) await modifyThread(currentMb!.email, id, change);
      return ids.length;
    },
    onSuccess: (n, v) => {
      qc.invalidateQueries({ queryKey: ["mailThreads"] });
      qc.invalidateQueries({ queryKey: ["mailUnread"] });
      if (selected && v.ids.includes(selected)) setSelected(null);
      setPicks([]);
      const many = n === 1 ? "1 email" : `${n} emails`;
      snack(
        v.change.notJunk ? `${many} moved to the inbox.`
          : v.change.unarchive ? `${many} back in the inbox.`
            : v.change.archive ? `${many} archived. Find them under Archive or All mail.`
              : `${many} marked as read.`,
      );
    },
    onError: () => snack("That didn't go through. Try again."),
  });

  // Ticks belong to the list you're looking at, so clear them when it changes.
  useEffect(() => { setPicks([]); }, [currentMb?.email, folder, search]);

  /** Every row you can tick, in the order they're on the screen — what "tick
   *  them all" means, and what a Shift-click runs between. */
  const rowIds = useMemo(
    () => (folder === "sent"
      ? sentItems.filter((it) => it.kind !== "auto").map((it) => it.id)
      : (threads.data?.threads ?? []).map((t) => t.id)),
    [folder, sentItems, threads.data],
  );

  /** The last row you ticked. Holding Shift and ticking another one picks
   *  everything between the two, the way a file list does. */
  const anchor = useRef<string | null>(null);
  const pick = (id: string, on: boolean, shift = false) => {
    setPicks((p) => {
      const from = anchor.current;
      if (shift && from && from !== id) {
        const a = rowIds.indexOf(from);
        const b = rowIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const run = rowIds.slice(Math.min(a, b), Math.max(a, b) + 1);
          return on ? [...new Set([...p, ...run])] : p.filter((x) => !run.includes(x));
        }
      }
      return on ? [...p, id] : p.filter((x) => x !== id);
    });
    anchor.current = id;
  };
  const allPicked = rowIds.length > 0 && picks.length >= rowIds.length;

  const openThread = (id: string) => {
    setSelected(id);
    qc.invalidateQueries({ queryKey: ["mailThreads"] });
    qc.invalidateQueries({ queryKey: ["mailUnread"] });
  };

  const quoteOf = (m: MessageFull) =>
    `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555">On ${esc(timeFull(m.date))}, ${esc(m.from.name || m.from.email)} wrote:<br>${m.html}</blockquote>`;

  const startReply = (m: MessageFull, all = false) => {
    if (!currentMb) return;
    const others = [m.from.email, ...(all ? `${m.to},${m.cc}`.split(",") : [])]
      .map((s) => emailIn(s))
      .filter((e) => e && e.toLowerCase() !== currentMb.email.toLowerCase());
    openCompose({
      to: Array.from(new Set(others)).join(", "),
      cc: "",
      subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      body: "",
      threadId: selected ?? undefined,
      inReplyTo: m.messageId,
      references: m.messageId,
      quoted: quoteOf(m),
      replyTo: { name: m.from.name, email: m.from.email, subject: m.subject },
    }, currentMb.email);
  };
  const startForward = (m: MessageFull) => {
    openCompose({
      to: "", cc: "",
      subject: /^fwd:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
      body: "",
      quoted: `<br>---------- Forwarded message ----------<br>From: ${esc(m.from.name)} &lt;${esc(m.from.email)}&gt;<br>Date: ${esc(timeFull(m.date))}<br>Subject: ${esc(m.subject)}<br><br>${m.html}`,
    }, currentMb?.email);
  };

  const showList = !selected;
  const archived = folder === "archive";
  // What Google decided was junk. Worth a look: a real reply lands here now
  // and again, and from here it can be put straight back.
  const junk = folder === "junk";
  const msgs = thread.data?.messages ?? [];
  const last = msgs[msgs.length - 1];
  const autoOpen = selected ? autoById.get(selected) : undefined;

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", gap: 1 }}>
          <IconButton edge="start" color="inherit" onClick={() => (selected ? setSelected(null) : navigate(-1))} aria-label="Back"><ArrowBackIcon /></IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, mr: 1, display: { xs: "none", sm: "block" } }}>Mail</Typography>
          {currentMb && (
            <Select
              size="small" value={currentMb.email}
              onChange={(e) => { setMailbox(e.target.value); setSelected(null); }}
              sx={{
                fontSize: 14, maxWidth: { xs: 190, sm: 320 }, bgcolor: "rgba(255,255,255,0.12)", color: "inherit",
                ".MuiSvgIcon-root": { color: "inherit" }, ".MuiOutlinedInput-notchedOutline": { border: 0 },
              }}
            >
              {mbList.map((m) => (
                <MenuItem key={m.email} value={m.email} sx={{ fontSize: 14 }}>
                  {m.display_name} · {m.email}
                  {!!unreadByBox[m.email] && (
                    <Box component="span" sx={{ ml: 1, px: 0.75, borderRadius: 5, fontSize: 12, fontWeight: 600, bgcolor: tokens.redTint, color: tokens.red }}>
                      {unreadByBox[m.email]}
                    </Box>
                  )}
                </MenuItem>
              ))}
            </Select>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Check for new mail">
            <IconButton color="inherit" aria-label="Check for new mail" onClick={() => { threads.refetch(); qc.invalidateQueries({ queryKey: ["mailUnread"] }); }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit signature">
            <IconButton color="inherit" aria-label="Edit signature" onClick={() => setSigOpen(true)}><SignatureIcon /></IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Folders + search */}
      <Box sx={{ bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}`, display: "flex", alignItems: "center", gap: 1, px: { xs: 0.5, sm: 1.5 } }}>
        <Tabs
          value={folder}
          onChange={(_e, v) => { setFolder(v as Folder); setSelected(null); }}
          variant="scrollable" scrollButtons={false}
          sx={{ minHeight: 44, "& .MuiTab-root": { minHeight: 44, minWidth: 0, px: 1.5, fontSize: 13.5, textTransform: "none" } }}
        >
          <Tab value="inbox" label="Inbox" />
          <Tab value="sent" label="Sent" />
          <Tab value="junk" label="Junk" />
          <Tab value="archive" label="Archive" />
          <Tab value="all" label="All mail" />
        </Tabs>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, bgcolor: tokens.hover, borderRadius: 1, px: 1, my: 0.75 }}>
          <SearchIcon sx={{ fontSize: 18, color: tokens.ink3 }} />
          <InputBase
            placeholder="Search mail" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setSelected(null); } }}
            sx={{ fontSize: 13.5, width: { xs: 96, sm: 180 } }}
            inputProps={{ "aria-label": "Search mail" }}
          />
          {search && <IconButton size="small" onClick={() => { setQ(""); setSearch(""); }} aria-label="Clear search"><CloseIcon sx={{ fontSize: 15 }} /></IconButton>}
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Thread list */}
          <Box
            sx={{
              width: { xs: "100%", md: 340, lg: 400 }, flexShrink: 0,
              display: { xs: showList ? "block" : "none", md: "block" },
              borderRight: { md: `1px solid ${tokens.divider}` }, overflowY: "auto", bgcolor: "background.paper",
            }}
          >
            {picks.length > 0 && (
              <Box
                sx={{
                  position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75,
                  px: 1.5, py: 1, bgcolor: tokens.hover, borderBottom: `1px solid ${tokens.divider}`,
                }}
              >
                <Tooltip title={allPicked ? "Untick them all" : "Tick every email in this list"}>
                  <Checkbox
                    checked={allPicked}
                    indeterminate={!allPicked}
                    onChange={(e) => { anchor.current = null; setPicks(e.target.checked ? rowIds : []); }}
                    sx={{ p: 0.5 }}
                    slotProps={{ input: { "aria-label": "Tick every email in this list" } }}
                  />
                </Tooltip>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
                  {allPicked ? `All ${picks.length} picked` : `${picks.length} picked`}
                </Typography>
                {picks.length === 1 && desktop && (
                  <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>
                    — hold Shift and tick another to take the whole run
                  </Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small" color="inherit" disabled={bulk.isPending}
                  onClick={() => bulk.mutate({ ids: picks, change: { read: true } })}
                  sx={{ textTransform: "none", fontSize: 13 }}
                >
                  Mark read
                </Button>
                <Button
                  size="small" variant="contained" disableElevation disabled={bulk.isPending}
                  startIcon={archived || junk ? <MoveToInboxOutlinedIcon sx={{ fontSize: 17 }} /> : <ArchiveOutlinedIcon sx={{ fontSize: 17 }} />}
                  onClick={() => bulk.mutate({ ids: picks, change: junk ? { notJunk: true } : archived ? { unarchive: true } : { archive: true } })}
                  sx={{ textTransform: "none", fontSize: 13 }}
                >
                  {junk ? "Not junk" : archived ? "Back to inbox" : "Archive"}
                </Button>
                <Tooltip title="Untick them all">
                  <IconButton size="small" aria-label="Untick them all" onClick={() => setPicks([])}>
                    <CloseIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
            {notConnected && (
              <Box sx={{ p: 3 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>Inbox not connected yet</Typography>
                <Typography sx={{ fontSize: 13, color: tokens.ink3, lineHeight: 1.5 }}>
                  Once the Google key is in place this becomes your live {currentMb?.email} inbox — read, reply and send.
                </Typography>
              </Box>
            )}
            {threads.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}><CircularProgress size={22} /></Box>}
            {threads.isError && !notConnected && (
              <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't load this folder. Tap the refresh arrow to try again.</Typography></Box>
            )}
            {threads.data && (folder === "sent" ? sentItems.length === 0 : threads.data.threads.length === 0) && (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography sx={{ fontSize: 14, color: tokens.ink3 }}>
                  {search ? `Nothing matches "${search}".`
                    : folder === "inbox" ? "Inbox empty. Nicely done."
                      : junk ? "Nothing in junk. Google hasn't held anything back."
                        : "Nothing here."}
                </Typography>
              </Box>
            )}
            {folder === "sent"
              ? sentItems.map((it) => (it.kind === "auto"
                ? <AutoRow key={it.id} e={it.e} active={it.id === selected} onClick={() => setSelected(it.id)} />
                : <ThreadRow key={it.id} t={it.t} active={it.id === selected} onClick={() => openThread(it.id)} tick={tickByThread.get(it.id)} picked={picks.includes(it.id)} anyPicked={picks.length > 0} onPick={pick} />))
              : threads.data?.threads.map((t) => (
                <ThreadRow key={t.id} t={t} active={t.id === selected} onClick={() => openThread(t.id)} picked={picks.includes(t.id)} anyPicked={picks.length > 0} onPick={pick} />
              ))}
          </Box>

          {/* Reading pane */}
          <Box sx={{ flex: 1, minWidth: 0, display: { xs: showList ? "none" : "block", md: "block" }, overflowY: "auto" }}>
            {!selected && (
              <Box sx={{ display: { xs: "none", md: "flex" }, height: "100%", alignItems: "center", justifyContent: "center" }}>
                <Typography sx={{ color: tokens.ink3, fontSize: 14 }}>Pick an email on the left to read it</Typography>
              </Box>
            )}
            {autoOpen && <AutoDetail e={autoOpen} />}
            {selected && !isAuto && thread.isLoading && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={24} /></Box>}
            {selected && !isAuto && thread.isError && (
              <Box sx={{ p: 3 }}><Typography sx={{ fontSize: 13, color: tokens.red }}>Couldn't open this email. Go back and try again.</Typography></Box>
            )}
            {selected && thread.data && currentMb && (
              <Box sx={{ maxWidth: 860, mx: "auto", p: { xs: 1.25, md: 3 }, pb: { xs: 12, md: 10 } }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: { xs: 17, md: 20 }, fontWeight: 500, lineHeight: 1.3 }}>{thread.data.subject}</Typography>
                    {msgs.length > 1 && (
                      <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 0.25 }}>{msgs.length} emails in this conversation</Typography>
                    )}
                  </Box>
                  <Tooltip title={junk ? "Not junk — put it in the inbox" : archived ? "Put it back in the inbox" : "Archive — takes it out of the inbox, keeps it in All mail"}>
                    <IconButton
                      aria-label={junk ? "Not junk" : archived ? "Put it back in the inbox" : "Archive"}
                      onClick={() => act.mutate({ id: selected, change: junk ? { notJunk: true } : archived ? { unarchive: true } : { archive: true } })}
                      sx={{ width: 44, height: 44 }}
                    >
                      {archived || junk ? <MoveToInboxOutlinedIcon fontSize="small" /> : <ArchiveOutlinedIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Box>
                {msgs.map((m, i) => (
                  <MessageBlock
                    key={m.id}
                    m={m}
                    mailbox={currentMb.email}
                    startOpen={i === msgs.length - 1}
                    canReplyAll={`${m.to},${m.cc}`.split(",").some((s) => emailIn(s) && emailIn(s).toLowerCase() !== currentMb.email.toLowerCase())}
                    onReply={() => startReply(m)}
                    onReplyAll={() => startReply(m, true)}
                    onForward={() => startForward(m)}
                    tick={tickByMsg.get(m.id)}
                  />
                ))}
                {last && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                    <Button variant="contained" disableElevation startIcon={<ReplyIcon />} onClick={() => startReply(last)}>
                      Reply to {last.from.name?.split(" ")[0] || last.from.email}
                    </Button>
                    <Button variant="outlined" color="inherit" startIcon={<ForwardIcon />} onClick={() => startForward(last)}>Forward</Button>
                  </Box>
                )}
              </Box>
            )}
          </Box>
      </Box>

      {/* Write a new email. Sits clear of the phone's bottom bar. */}
      <Button
        variant="contained" disableElevation startIcon={<EditOutlinedIcon />}
        onClick={() => currentMb && openCompose({ to: "", cc: "", subject: "", body: "" }, currentMb.email)}
        disabled={!currentMb}
        sx={{ position: "fixed", right: { xs: 14, md: 24 }, bottom: { xs: 18, md: 24 }, borderRadius: 7, px: 2.5, py: 1.25, boxShadow: 3, zIndex: 1200 }}
      >
        {desktop ? "Write an email" : "Write"}
      </Button>

      {sigOpen && currentMb && (
        <SignatureDialog mailbox={currentMb} onClose={() => setSigOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["mailboxes"] })} />
      )}
    </Box>
  );
}

/** The round photo doubles as the tick box. Point at it (or tap it on a phone)
 *  and it turns into one — so the list stays clean until you actually want to
 *  do something to several emails at once. */
function RowPicker({ name, email, picked, anyPicked, onPick }: {
  name: string; email: string; picked: boolean; anyPicked: boolean;
  onPick: (on: boolean, shift: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  const show = picked || anyPicked || hover;
  return (
    <Box
      role="checkbox"
      aria-checked={picked}
      aria-label={`Pick the email from ${name}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // Shift-clicking otherwise highlights the text of half the list.
      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
      onClick={(e) => { e.stopPropagation(); onPick(!picked, e.shiftKey); }}
      sx={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", cursor: "pointer", borderRadius: "50%" }}
    >
      {show
        ? <Checkbox checked={picked} tabIndex={-1} sx={{ p: 0, pointerEvents: "none" }} slotProps={{ input: { tabIndex: -1 } }} />
        : <SenderAvatar name={name} email={email} size={36} />}
    </Box>
  );
}

function ThreadRow({ t, active, onClick, tick, picked, anyPicked, onPick }: {
  t: ThreadSummary; active: boolean; onClick: () => void; tick?: SentStatus;
  /** Ticked off for doing several at once. Left out where that isn't offered. */
  picked?: boolean; anyPicked?: boolean; onPick?: (id: string, on: boolean, shift: boolean) => void;
}) {
  return (
    <Box
      onClick={onClick}
      role="button"
      sx={{
        display: "flex", gap: 1.25, px: 2, py: 1.25, cursor: "pointer", minHeight: 64,
        borderBottom: `1px solid ${tokens.divider}`,
        bgcolor: picked || active ? tokens.hover : "transparent",
        "&:hover": { bgcolor: tokens.hover },
      }}
    >
      {onPick
        ? <RowPicker name={t.who.name} email={t.who.email} picked={!!picked} anyPicked={!!anyPicked} onPick={(on, shift) => onPick(t.id, on, shift)} />
        : <SenderAvatar name={t.who.name} email={t.who.email} size={36} />}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: t.unread ? 700 : 500, color: tokens.ink, flex: 1 }}>
            {t.who.name}{t.count > 1 ? ` (${t.count})` : ""}
          </Typography>
          <Tooltip title={timeFull(t.date)}>
            <Typography sx={{ fontSize: 11.5, color: t.unread ? tokens.primary : tokens.ink3, whiteSpace: "nowrap", fontWeight: t.unread ? 700 : 400 }}>
              {timeShort(t.date)}
            </Typography>
          </Tooltip>
        </Box>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: t.unread ? 600 : 400, color: tokens.ink }}>{t.subject}</Typography>
        <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink3 }}>{t.snippet}</Typography>
        {tick && <Box sx={{ mt: 0.25 }}><Ticks {...tickState(tick)} ours who={tick.bounce_reason} /></Box>}
      </Box>
      {t.unread && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tokens.primary, mt: 1, flexShrink: 0 }} />}
    </Box>
  );
}

/** One email in the conversation. Older ones come in folded up (same as Gmail)
 *  so a long back-and-forth isn't a wall of text; the newest one is open. */
function MessageBlock({ m, mailbox, startOpen, canReplyAll, onReply, onReplyAll, onForward, tick }: {
  m: MessageFull; mailbox: string; startOpen: boolean; canReplyAll: boolean;
  onReply: () => void; onReplyAll: () => void; onForward: () => void;
  /** Present only on the mails we sent — it carries their ticks. */
  tick?: SentStatus;
}) {
  const [open, setOpen] = useState(startOpen);
  const preview = useMemo(() => plainText(m.html).slice(0, 120), [m.html]);
  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: 1.5, mb: 1.5, bgcolor: "background.paper", overflow: "hidden" }}>
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1.25, px: { xs: 1.25, md: 2 }, py: 1.25, cursor: "pointer", "&:hover": { bgcolor: tokens.hover } }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <SenderAvatar name={m.from.name} email={m.from.email} size={34} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>
            {m.from.name || m.from.email}
            <Typography component="span" sx={{ fontSize: 12, color: tokens.ink3, ml: 0.5 }}>&lt;{m.from.email}&gt;</Typography>
          </Typography>
          <Typography noWrap sx={{ fontSize: 12, color: tokens.ink3 }}>{open ? `to ${m.to}` : preview}</Typography>
        </Box>
        {tick && <Box sx={{ flexShrink: 0, display: { xs: "none", sm: "block" } }}><Ticks {...tickState(tick)} ours who={tick.bounce_reason} /></Box>}
        <Tooltip title={timeFull(m.date)}>
          <Typography sx={{ fontSize: 12, color: tokens.ink3, whiteSpace: "nowrap" }}>{timeShort(m.date)}</Typography>
        </Tooltip>
        <ExpandMoreIcon sx={{ fontSize: 20, color: tokens.ink3, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </Box>
      {open && (
        <>
          <Divider />
          <Box sx={{ bgcolor: "#fff" }}>
            <Body html={m.html} />
          </Box>
          {m.attachments.length > 0 && (
            <Box sx={{ px: { xs: 1.25, md: 2 }, pt: 1.5, display: "flex", flexWrap: "wrap", gap: 1 }}>
              {m.attachments.map((a) => <AttachmentChip key={a.attachmentId} mailbox={mailbox} messageId={m.id} att={a} />)}
            </Box>
          )}
          <Box sx={{ display: "flex", gap: 0.5, px: { xs: 0.75, md: 1.5 }, py: 0.75 }}>
            <Tooltip title={`Reply to ${m.from.name || m.from.email}`}>
              <IconButton size="small" aria-label="Reply" onClick={onReply} sx={{ width: 40, height: 40 }}><ReplyIcon fontSize="small" /></IconButton>
            </Tooltip>
            {canReplyAll && (
              <Tooltip title="Reply to everyone on this email">
                <IconButton size="small" aria-label="Reply to everyone" onClick={onReplyAll} sx={{ width: 40, height: 40 }}><ReplyAllIcon fontSize="small" /></IconButton>
              </Tooltip>
            )}
            <Tooltip title="Forward this to someone else">
              <IconButton size="small" aria-label="Forward" onClick={onForward} sx={{ width: 40, height: 40 }}><ForwardIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>
        </>
      )}
    </Box>
  );
}

// ── EstateKit's own emails, in with everything else we've sent ─────────────
/** A row in Sent for an email a workflow sent. It reads the same as a row for
 *  mail someone typed out — because as far as the person who got it goes, it
 *  came from us either way. */
function AutoRow({ e, active, onClick }: { e: SentEmail; active: boolean; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      role="button"
      sx={{
        display: "flex", gap: 1.25, px: 2, py: 1.25, cursor: "pointer", minHeight: 64,
        borderBottom: `1px solid ${tokens.divider}`,
        bgcolor: active ? tokens.hover : "transparent",
        "&:hover": { bgcolor: tokens.hover },
      }}
    >
      <SenderAvatar name={e.lead_name || e.lead_email || "?"} email={e.lead_email ?? ""} size={36} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: 500, color: tokens.ink, flex: 1 }}>
            To {e.lead_name || e.lead_email || "a lead"}
          </Typography>
          <Tooltip title={timeFull(e.sent_at)}>
            <Typography sx={{ fontSize: 11.5, color: tokens.ink3, whiteSpace: "nowrap" }}>{timeShort(e.sent_at)}</Typography>
          </Tooltip>
        </Box>
        <Typography noWrap sx={{ fontSize: 13.5, color: tokens.ink }}>{e.subject || "(no subject)"}</Typography>
        <Box sx={{ mt: 0.25 }}>
          <Ticks delivered={e.delivered} opened={!!e.opened_at} clicked={e.clicked} bounced={e.bounced} ours who={e.lead_email} />
        </Box>
      </Box>
    </Box>
  );
}

/** Opening one of those: who it went to and how it landed. The workflow keeps
 *  the record, not the words, so there's no body to show — we say so plainly
 *  instead of putting up an empty page. */
function AutoDetail({ e }: { e: SentEmail }) {
  return (
    <Box sx={{ maxWidth: 860, mx: "auto", p: { xs: 1.25, md: 3 }, pb: { xs: 12, md: 10 } }}>
      <Typography sx={{ fontSize: { xs: 17, md: 20 }, fontWeight: 500, lineHeight: 1.3 }}>{e.subject || "(no subject)"}</Typography>
      <Box sx={{ display: "flex", gap: 1.25, alignItems: "center", mt: 2 }}>
        <SenderAvatar name={e.lead_name || e.lead_email || "?"} email={e.lead_email ?? ""} size={40} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{e.lead_name || e.lead_email || "Unknown lead"}</Typography>
          <Typography noWrap sx={{ fontSize: 12.5, color: tokens.ink3 }}>{e.lead_email}</Typography>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Ticks delivered={e.delivered} opened={!!e.opened_at} clicked={e.clicked} bounced={e.bounced} ours who={e.lead_email} />
          <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{timeFull(e.sent_at)}</Typography>
        </Box>
      </Box>
      <Box sx={{ mt: 2.5, p: 2, borderRadius: 1.5, bgcolor: tokens.surface2, border: `1px solid ${tokens.divider}` }}>
        <Typography sx={{ fontSize: 13.5, color: tokens.ink2, lineHeight: 1.6 }}>
          This one went out on its own, from the follow-up emails set up for this lead. The ticks above show how it
          landed. The wording lives with the workflow that sent it, so it isn't kept here.
        </Typography>
      </Box>
    </Box>
  );
}
