// "Needs attention" alerts in Discord: only for things that stop leads or
// messages getting through. Each is posted once, then held back for a while
// (see track-activity), so a problem that lasts all day is one message, not
// hundreds. Best-effort: a failed alert never stops the work that raised it.

export interface Attention {
  /** The same problem always has the same key, e.g. "fb_form:<form id>". */
  key: string;
  /** Short, plain: "WhatsApp messages aren't going out". */
  title: string;
  /** What we saw, in plain words. */
  detail: string;
  /** What someone should do about it. */
  fix: string;
  agentId?: string | null;
  /** Only post once it's happened this many times within `withinMinutes`, so a blip is ignored. */
  minTimes?: number;
  withinMinutes?: number;
  /** Then stay quiet about it for this long. */
  quietHours?: number;
}

export async function needsAttention(a: Attention): Promise<void> {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/track-activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ event: "attention", ...a }),
    });
  } catch (e) {
    console.error("attention alert", a.key, String(e));
  }
}
