import { useEffect, useRef } from "react";
import { Box } from "@mui/material";

// Our own video player, so we can measure every viewer the way Wistia does:
// where they are, every second, and the furthest point they reach.
//  * Our own hosted videos (a direct .mp4 / .webm link): the browser's
//    built-in <video>, which reports the position as it plays.
//  * YouTube links: YouTube's official IFrame API. It has no "progress"
//    event, so while it plays we ask it for the current time every second.
// Both report the same thing to onProgress, so the tracking (next step) is
// the same whichever kind of video it is.

export interface VideoProgress {
  /** Seconds into the video right now. */
  position: number;
  /** Length of the video in seconds (0 until known). */
  duration: number;
  playing: boolean;
  /** True once, when it reaches the end. */
  ended?: boolean;
}

type Kind = { type: "youtube"; id: string } | { type: "file"; src: string } | null;

/** What kind of video a link is, or null if we can't play it. */
export function videoKind(url: string): Kind {
  const u = (url || "").trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (yt) return { type: "youtube", id: yt[1] };
  if (/^https:\/\/\S+\.(mp4|webm|mov|m4v)(\?\S*)?$/i.test(u)) return { type: "file", src: u };
  return null;
}

export const canPlayVideo = (url: string) => videoKind(url) !== null;

// ── YouTube IFrame API: loaded once, on first use ──────────────────────────
type YTPlayer = { getCurrentTime(): number; getDuration(): number; getPlayerState(): number; destroy(): void };
type YTNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { PLAYING: number; ENDED: number };
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let ytReady: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytReady) {
    ytReady = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT!);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      document.head.appendChild(s);
    });
  }
  return ytReady;
}

export default function VideoPlayer({ url, onProgress }: { url: string; onProgress?: (p: VideoProgress) => void }) {
  const kind = videoKind(url);
  const holder = useRef<HTMLDivElement>(null);
  const report = useRef(onProgress);
  report.current = onProgress;

  // YouTube: build the player, then poll the position while it plays.
  useEffect(() => {
    if (kind?.type !== "youtube" || !holder.current) return;
    let player: YTPlayer | null = null;
    let timer: number | undefined;
    let cancelled = false;
    const el = document.createElement("div");
    holder.current.appendChild(el);
    loadYouTube().then((YT) => {
      if (cancelled) return;
      player = new YT.Player(el, {
        videoId: kind.id,
        width: "100%",
        height: "100%",
        host: "https://www.youtube-nocookie.com",
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            const p = player!;
            const tick = () => report.current?.({ position: p.getCurrentTime(), duration: p.getDuration(), playing: p.getPlayerState() === YT.PlayerState.PLAYING });
            window.clearInterval(timer);
            if (e.data === YT.PlayerState.PLAYING) timer = window.setInterval(tick, 1000);
            if (e.data === YT.PlayerState.ENDED) report.current?.({ position: p.getDuration(), duration: p.getDuration(), playing: false, ended: true });
            else tick();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      player?.destroy();
      el.remove();
    };
  }, [kind?.type === "youtube" ? kind.id : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!kind) return null;

  return (
    <Box sx={{ position: "relative", pt: "56.25%", borderRadius: "10px", overflow: "hidden", bgcolor: "#000", "& iframe, & video": { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 } }}>
      {kind.type === "youtube" ? (
        <Box ref={holder} sx={{ position: "absolute", inset: 0 }} />
      ) : (
        <video
          src={kind.src}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => report.current?.({ position: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0, playing: !e.currentTarget.paused })}
          onPause={(e) => report.current?.({ position: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0, playing: false })}
          onEnded={(e) => report.current?.({ position: e.currentTarget.duration, duration: e.currentTarget.duration, playing: false, ended: true })}
        />
      )}
    </Box>
  );
}
