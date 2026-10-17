import { useEffect, useRef, useState } from "react";
import { Box, ButtonBase, IconButton, Typography } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import { readableOn } from "../lib/contrast";

// Our own video player, so we can measure every viewer the way Wistia does:
// where they are, every second, and the furthest point they reach.
//  * Our own hosted videos (a direct .mp4 / .webm link): the browser's
//    built-in <video>, which reports the position as it plays.
//  * YouTube links: YouTube's IFrame API with YouTube's own controls hidden
//    and ours on top (thumbnail + one play button, a slim bar). Our layer
//    covers the video, so YouTube's title, channel, "More videos" and
//    suggested videos never show. YouTube has no "progress" event, so while
//    it plays we ask for the current time every second.
// Both report the same thing to onProgress, so the tracking is the same
// whichever kind of video it is.

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

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export default function VideoPlayer({ url, accent = "#1a73e8", onProgress }: { url: string; accent?: string; onProgress?: (p: VideoProgress) => void }) {
  const kind = videoKind(url);
  const report = useRef(onProgress);
  report.current = onProgress;
  if (!kind) return null;

  if (kind.type === "youtube") return <YouTubePlayer key={kind.id} id={kind.id} accent={accent} report={report} />;

  return (
    <Frame>
      <video
        src={kind.src}
        controls
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => report.current?.({ position: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0, playing: !e.currentTarget.paused })}
        onPause={(e) => report.current?.({ position: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0, playing: false })}
        onEnded={(e) => report.current?.({ position: e.currentTarget.duration, duration: e.currentTarget.duration, playing: false, ended: true })}
      />
    </Frame>
  );
}

function Frame({ children, frameRef }: { children: React.ReactNode; frameRef?: React.Ref<HTMLDivElement> }) {
  return (
    <Box
      ref={frameRef}
      sx={{
        position: "relative", pt: "56.25%", borderRadius: "10px", overflow: "hidden", bgcolor: "#000",
        "& iframe, & video": { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 },
        "&:fullscreen": { pt: 0, borderRadius: 0 },
      }}
    >
      {children}
    </Box>
  );
}

// ── YouTube, with our own controls ──────────────────────────────────────────
type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
};
type YTNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { PLAYING: number; ENDED: number; PAUSED: number; BUFFERING: number };
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

type Status = "idle" | "playing" | "paused" | "ended";

function YouTubePlayer({ id, accent, report }: { id: string; accent: string; report: React.MutableRefObject<((p: VideoProgress) => void) | undefined> }) {
  const frame = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const onAccent = readableOn(accent);

  useEffect(() => {
    if (!holder.current) return;
    let timer: number | undefined;
    let cancelled = false;
    const el = document.createElement("div");
    holder.current.appendChild(el);
    loadYouTube().then((YT) => {
      if (cancelled) return;
      const p: YTPlayer = new YT.Player(el, {
        videoId: id,
        width: "100%",
        height: "100%",
        host: "https://www.youtube-nocookie.com",
        // Everything of YouTube's own switched off: we draw the controls.
        playerVars: { controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0, disablekb: 1, cc_load_policy: 0 },
        events: {
          onReady: () => {
            player.current = p;
            setDur(p.getDuration());
            setReady(true);
          },
          onStateChange: (e: { data: number }) => {
            const tick = () => {
              const position = p.getCurrentTime();
              const duration = p.getDuration();
              setPos(position);
              setDur(duration);
              report.current?.({ position, duration, playing: p.getPlayerState() === YT.PlayerState.PLAYING });
            };
            window.clearInterval(timer);
            if (e.data === YT.PlayerState.PLAYING) {
              setStatus("playing");
              timer = window.setInterval(tick, 1000);
              tick();
            } else if (e.data === YT.PlayerState.ENDED) {
              setStatus("ended");
              setPos(p.getDuration());
              report.current?.({ position: p.getDuration(), duration: p.getDuration(), playing: false, ended: true });
            } else if (e.data === YT.PlayerState.PAUSED) {
              setStatus("paused");
              tick();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      player.current?.destroy();
      player.current = null;
      el.remove();
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    const p = player.current;
    if (!p) return;
    if (status === "ended") p.seekTo(0, true);
    p.playVideo();
  };
  const toggle = () => (status === "playing" ? player.current?.pauseVideo() : play());
  const seek = (fraction: number) => {
    if (!player.current || !dur) return;
    const s = Math.max(0, Math.min(dur, fraction * dur));
    player.current.seekTo(s, true);
    setPos(s);
  };
  const toggleMute = () => {
    if (!player.current) return;
    if (muted) player.current.unMute();
    else player.current.mute();
    setMuted(!muted);
  };
  const fullscreen = () => {
    const f = frame.current;
    if (!f) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void f.requestFullscreen?.().catch(() => {});
  };

  const showCover = status !== "playing";
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;

  return (
    <Frame frameRef={frame}>
      <Box ref={holder} sx={{ position: "absolute", inset: 0 }} />

      {/* Our layer over YouTube's: taps go to us, so YouTube's own menus,
          title and suggested videos never appear. */}
      <ButtonBase
        onClick={toggle}
        disabled={!ready}
        aria-label={status === "playing" ? "Pause" : status === "ended" ? "Watch again" : "Play"}
        sx={{ position: "absolute", inset: 0, bottom: status === "idle" ? 0 : 44, display: "block", cursor: ready ? "pointer" : "default" }}
      >
        {showCover && (
          <Box
            sx={{
              position: "absolute", inset: 0,
              // Before it starts: the video's own thumbnail, not YouTube's player screen.
              backgroundImage: status === "idle" ? `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)` : undefined,
              backgroundSize: "cover", backgroundPosition: "center",
              bgcolor: status === "idle" ? "#000" : "rgba(0,0,0,.55)",
              display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 1,
            }}
          >
            <Box sx={{ width: 72, height: 72, borderRadius: "50%", bgcolor: accent, color: onAccent, display: "grid", placeItems: "center", boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>
              {status === "ended" ? <ReplayRoundedIcon sx={{ fontSize: 40 }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 48 }} />}
            </Box>
            {status === "ended" && <Typography sx={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>Watch again</Typography>}
            {status === "idle" && dur > 0 && (
              <Box sx={{ position: "absolute", right: 10, bottom: 10, bgcolor: "rgba(0,0,0,.7)", color: "#fff", fontSize: 12.5, fontWeight: 600, px: 0.75, py: 0.25, borderRadius: "4px" }}>
                {clock(dur)}
              </Box>
            )}
          </Box>
        )}
      </ButtonBase>

      {/* Slim bar: play/pause, progress (tap to jump), time, sound, full screen. */}
      {status !== "idle" && (
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 44, display: "flex", alignItems: "center", gap: 0.5, px: 0.5, bgcolor: "rgba(0,0,0,.75)", color: "#fff" }}>
          <IconButton size="small" onClick={toggle} aria-label={status === "playing" ? "Pause" : "Play"} sx={{ color: "#fff" }}>
            {status === "playing" ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
          </IconButton>
          <Box
            role="slider"
            aria-label="Position in the video"
            aria-valuemin={0}
            aria-valuemax={Math.round(dur)}
            aria-valuenow={Math.round(pos)}
            tabIndex={0}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - r.left) / r.width);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seek((pos + 5) / (dur || 1));
              if (e.key === "ArrowLeft") seek((pos - 5) / (dur || 1));
            }}
            sx={{ flex: 1, height: 24, display: "flex", alignItems: "center", cursor: "pointer" }}
          >
            <Box sx={{ position: "relative", width: "100%", height: 4, borderRadius: 2, bgcolor: "rgba(255,255,255,.3)" }}>
              <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 2, bgcolor: accent }} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums", mx: 0.5, whiteSpace: "nowrap" }}>
            {clock(pos)} / {clock(dur)}
          </Typography>
          <IconButton size="small" onClick={toggleMute} aria-label={muted ? "Sound on" : "Sound off"} sx={{ color: "#fff" }}>
            {muted ? <VolumeOffRoundedIcon fontSize="small" /> : <VolumeUpRoundedIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" onClick={fullscreen} aria-label="Full screen" sx={{ color: "#fff" }}>
            <FullscreenRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Frame>
  );
}
