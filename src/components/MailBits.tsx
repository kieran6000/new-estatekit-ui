import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, Box, Tooltip, Typography } from "@mui/material";
import DraftsOutlinedIcon from "@mui/icons-material/DriveFileRenameOutline";
import CloseIcon from "@mui/icons-material/Close";
import { tokens } from "../theme";
import { listMailboxes, unreadCount } from "../api/mail";
import { clearDraft, draftLabel, getDraft, subscribeDraft, type StoredDraft } from "../lib/mailDraft";

export const LAST_MB = "ek.mail.mailbox";

/** Unread count for the mailbox the operator last had open (partner@ until
 *  they pick another). Quiet on failure: the inbox not being connected yet
 *  must never put an error on the nav. */
function useMailUnread(): number {
  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: listMailboxes, staleTime: 5 * 60_000, retry: false });
  let saved = "";
  try { saved = localStorage.getItem(LAST_MB) ?? ""; } catch { /* ignore */ }
  const email = saved || mailboxes.data?.[0]?.email;
  const { data } = useQuery({
    queryKey: ["mailUnread", email],
    queryFn: () => unreadCount(email!),
    enabled: !!email,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    retry: false,
  });
  return data?.count ?? 0;
}

/** Red count on the Mail nav item, same as the Clients / Overview to-do count. */
export function MailBadge({ children }: { children: React.ReactNode }) {
  const count = useMailUnread();
  return (
    <Badge
      badgeContent={count}
      color="error"
      max={99}
      sx={{ "& .MuiBadge-badge": { fontSize: 11, height: 17, minWidth: 17, px: 0.5, right: -10, top: 2 } }}
    >
      {children}
    </Badge>
  );
}

/** The "unfinished email" pill. Sits above everything on every page so a
 *  half-written email can't be forgotten, and one tap puts it back on screen. */
export function MailDraftPill() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<StoredDraft | null>(() => getDraft());
  useEffect(() => subscribeDraft(() => setDraft(getDraft())), []);
  if (!draft) return null;
  return (
    <Box
      sx={{
        position: "fixed", right: { xs: 12, md: 20 }, bottom: { xs: 76, md: 20 }, zIndex: 1250,
        display: "flex", alignItems: "center", gap: 0.75, maxWidth: { xs: "calc(100vw - 24px)", sm: 340 },
        bgcolor: tokens.raised, border: `1px solid ${tokens.amberBorder}`, borderLeft: `3px solid ${tokens.amber}`,
        borderRadius: 2, boxShadow: 3, pl: 1.25, pr: 0.5, py: 0.75,
      }}
    >
      <DraftsOutlinedIcon sx={{ fontSize: 18, color: tokens.amber, flexShrink: 0 }} />
      <Box
        onClick={() => navigate("/mail?draft=1")}
        role="button"
        sx={{ minWidth: 0, cursor: "pointer", flex: 1 }}
      >
        <Typography sx={{ fontSize: 11, color: tokens.ink3, lineHeight: 1.2 }}>Unfinished email · tap to finish</Typography>
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: tokens.ink, lineHeight: 1.3 }}>{draftLabel(draft)}</Typography>
      </Box>
      <Tooltip title="Throw this draft away">
        <Box
          component="button"
          aria-label="Throw this draft away"
          onClick={() => clearDraft()}
          sx={{
            border: 0, bgcolor: "transparent", cursor: "pointer", display: "grid", placeItems: "center",
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0, color: tokens.ink3,
            "&:hover": { bgcolor: tokens.hover },
          }}
        >
          <CloseIcon sx={{ fontSize: 17 }} />
        </Box>
      </Tooltip>
    </Box>
  );
}
