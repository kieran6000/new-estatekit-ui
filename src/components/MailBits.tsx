import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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

/** The Mail nav item. The unread count used to show here as a red badge, but
 *  with a busy shared inbox it was always high and drowned out the counts that
 *  mean "something needs you now" (Clients / Overview to-dos). Kieran asked for
 *  it gone — the per-box counts still live in useMailUnreadByBox if ever wanted. */
export function MailBadge({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
