import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@mui/material";
import { listMailboxes, unreadCount } from "../api/mail";

/** What's waiting in each inbox, counted one by one.
 *
 *  Every mailbox is counted, not just the one last opened — the badge is there
 *  to say "something needs you", and new mail in the shared inbox needs you
 *  just as much as new mail in your own. Quiet on failure: an inbox that isn't
 *  connected yet must never put an error on the nav. */
export function useMailUnreadByBox(): Record<string, number> {
  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: listMailboxes, staleTime: 5 * 60_000, retry: false });
  const emails = useMemo(() => (mailboxes.data ?? []).map((m) => m.email), [mailboxes.data]);
  const { data } = useQuery({
    queryKey: ["mailUnread", emails],
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(emails.map(async (e) => {
        try { out[e] = (await unreadCount(e)).count; } catch { out[e] = 0; }
      }));
      return out;
    },
    enabled: emails.length > 0,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    retry: false,
  });
  return data ?? {};
}

function useMailUnread(): number {
  const byBox = useMailUnreadByBox();
  return Object.values(byBox).reduce((a, b) => a + b, 0);
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
