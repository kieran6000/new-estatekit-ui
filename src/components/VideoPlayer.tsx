import { useEffect, useRef, useState } from "react";
import { Box, Button, ButtonBase, IconButton, Typography } from "@mui/material";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
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
//
// autoplay: browsers only let a video start by itself with the sound off, so
// it starts silent with a big "Tap to turn on sound" badge (the ClickFunnels
// trick). The tap turns the sound on and starts again from the beginning.
// The silent preview isn't reported: only a tap counts as a play.

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

/** The next step, shown over the video when it ends ("Pick a time for our call"). */
export interface EndCta { label: string; onClick: () => void; /** The step is further down the page (an arrow down, not across). */ below?: boolean }

export default function VideoPlayer({ url, accent = "#1a73e8", autoplay = false, endCta, onProgress }: { url: string; accent?: string; autoplay?: boolean; endCta?: EndCta; onProgress?: (p: VideoProgress) => void }) {
  const kind = videoKind(url);
  const report = useRef(onProgress);
  report.current = onProgress;
  if (!kind) return null;

  if (kind.type === "youtube") return <YouTubePlayer key={kind.id} id={kind.id} accent={accent} autoplay={autoplay} endCta={endCta} report={report} />;
  return <FilePlayer key={kind.src} src={kind.src} accent={accent} autoplay={autoplay} endCta={endCta} report={report} />;
}

type Report = React.MutableRefObject<((p: VideoProgress) => void) | undefined>;

/** Over a silent autoplay (like Vidalytics): the picture tinted in the
 *  agent's colour, "Your video is playing / Tap to turn on sound", and a
 *  speaker whose sound waves fill in one by one. The page's only animation. */
function SoundBadge({ accent, blocked = false }: { accent: string; blocked?: boolean }) {
  const ink = readableOn(accent);
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <Box
      sx={{
        width: "min(270px, 88%)", py: { xs: 1, sm: 1.5 }, px: 1.5, borderRadius: "10px", border: `2px solid ${ink}`,
        bgcolor: `color-mix(in srgb, ${accent} 94%, transparent)`, color: ink, boxShadow: "0 6px 20px rgba(0,0,0,.3)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.25, textAlign: "center",
        "& .ek-w1": { animation: "ek-w1 1.5s infinite" },
        "& .ek-w2": { animation: "ek-w2 1.5s infinite" },
        "@keyframes ek-w1": { "0%, 32%": { opacity: 0 }, "33%, 100%": { opacity: 1 } },
        "@keyframes ek-w2": { "0%, 65%": { opacity: 0 }, "66%, 100%": { opacity: 1 } },
        "@media (prefers-reduced-motion: reduce)": { "& .ek-w1, & .ek-w2": { animation: "none" } },
      }}
    >
      <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: { xs: 32, sm: 40 }, height: { xs: 32, sm: 40 } }}>
        <path d="M3 9v6h4l5 5V4L7 9H3z" fill="currentColor" />
        <path className="ek-w1" d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path className="ek-w2" d="M18.5 5.5a9.2 9.2 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: { xs: 15, sm: 16 }, lineHeight: 1.3, whiteSpace: "nowrap", color: "inherit" }}>
        {blocked ? "Tap to watch" : "Your video is playing"}
        <br />
        {blocked ? "with sound" : "Tap to turn on sound"}
      </Typography>
    </Box>
    </Box>
  );
}

/** When it ends: the next step as the one big button, "Watch again" small under it. */
function EndOverlay({ accent, cta, onReplay }: { accent: string; cta: EndCta; onReplay: () => void }) {
  return (
    <Box sx={{ position: "absolute", inset: 0, zIndex: 2, bgcolor: "rgba(0,0,0,.65)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, p: 2 }}>
      <Button
        variant="contained"
        size="large"
        onClick={cta.onClick}
        endIcon={cta.below ? <ArrowDownwardRoundedIcon /> : <ArrowForwardRoundedIcon />}
        sx={{ bgcolor: accent, color: readableOn(accent), maxWidth: "100%", "&:hover": { bgcolor: accent, filter: "brightness(0.9)" } }}
      >
        {cta.label}
      </Button>
      <Button size="small" onClick={onReplay} startIcon={<ReplayRoundedIcon />} sx={{ color: "#fff", textTransform: "none", fontSize: 13.5 }}>
        Watch again
      </Button>
    </Box>
  );
}

function FilePlayer({ src, accent, autoplay, endCta, report }: { src: string; accent: string; autoplay: boolean; endCta?: EndCta; report: Report }) {
  const video = useRef<HTMLVideoElement>(null);
  const [teasing, setTeasing] = useState(false);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const el = video.current;
    if (!autoplay || !el) return;
    el.muted = true;
    el.play().then(() => setTeasing(true)).catch(() => setTeasing(false));
  }, [autoplay]);
  const soundOn = () => {
    const el = video.current;
    if (!el) return;
    setTeasing(false);
    el.currentTime = 0;
    el.muted = false;
    void el.play().catch(() => {});
  };
  const send = (p: VideoProgress) => { if (!teasing) report.current?.(p); };
  return (
    <Frame>
      <video
        ref={video}
        src={src}
        controls={!teasing}
        playsInline
        preload="metadata"
        onTimeUpdate={(e) => send({ position: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0, playing: !e.currentTarget.paused })}
        onPause={(e) => send({ position: e.currentTarget.currentTime, duration: e.currentTarget.duration || 0, playing: false })}
        onPlay={() => setEnded(false)}
        onEnded={(e) => { send({ position: e.currentTarget.duration, duration: e.currentTarget.duration, playing: false, ended: true }); if (!teasing) setEnded(true); setTeasing(false); }}
      />
      {ended && endCta && (
        <EndOverlay accent={accent} cta={endCta} onReplay={() => { const el = video.current; if (!el) return; el.currentTime = 0; void el.play().catch(() => {}); }} />
      )}
      {teasing && (
        <ButtonBase onClick={soundOn} aria-label="Turn on sound" sx={{ position: "absolute", inset: 0, display: "block" }}>
          <SoundBadge accent={accent} />
        </ButtonBase>
      )}
    </Frame>
  );
}

function Frame({ children, frameRef, onPointerMove }: { children: React.ReactNode; frameRef?: React.Ref<HTMLDivElement>; onPointerMove?: React.PointerEventHandler<HTMLDivElement> }) {
  return (
    <Box
      ref={frameRef}
      onPointerMove={onPointerMove}
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

function YouTubePlayer({ id, accent, autoplay, endCta, report }: { id: string; accent: string; autoplay: boolean; endCta?: EndCta; report: Report }) {
  const frame = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  // Playing silently by itself, waiting for the tap that turns the sound on.
  const teaser = useRef(autoplay);
  const [teasing, setTeasing] = useState(false);
  // Still not playing a few seconds after it could have: the phone blocked it
  // (e.g. low-power mode). Then the same box says "Tap to watch with sound".
  const [startWaited, setStartWaited] = useState(false);
  useEffect(() => {
    if (!autoplay) return;
    const t = window.setTimeout(() => setStartWaited(true), 3000);
    return () => window.clearTimeout(t);
  }, [autoplay]);
  // The bar hides itself 2.5 seconds into playing (it covered the captions);
  // a tap or a mouse move brings it back.
  const [barShown, setBarShown] = useState(true);
  const barTimer = useRef<number | undefined>(undefined);
  const wake = () => {
    setBarShown(true);
    window.clearTimeout(barTimer.current);
    barTimer.current = window.setTimeout(() => setBarShown(false), 2500);
  };
  useEffect(() => {
    if (status === "playing") wake();
    else {
      window.clearTimeout(barTimer.current);
      setBarShown(true);
    }
    return () => window.clearTimeout(barTimer.current);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
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
        // iPhones only let a video start by itself if it's created muted and
        // set to play; muting it after it loads (as we did) is refused there.
        playerVars: { controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0, disablekb: 1, cc_load_policy: 0, ...(autoplay ? { autoplay: 1, mute: 1 } : {}) },
        events: {
          onReady: () => {
            player.current = p;
            setDur(p.getDuration());
            setReady(true);
            if (teaser.current) {
              p.mute();
              setMuted(true);
              p.playVideo();
            }
          },
          onStateChange: (e: { data: number }) => {
            const tick = () => {
              const position = p.getCurrentTime();
              const duration = p.getDuration();
              setPos(position);
              setDur(duration);
              if (!teaser.current) report.current?.({ position, duration, playing: p.getPlayerState() === YT.PlayerState.PLAYING });
            };
            window.clearInterval(timer);
            if (e.data === YT.PlayerState.PLAYING) {
              setStatus("playing");
              setTeasing(teaser.current);
              timer = window.setInterval(tick, 1000);
              tick();
            } else if (e.data === YT.PlayerState.ENDED) {
              setPos(p.getDuration());
              if (teaser.current) {
                // The silent preview ran out: back to Play (sound on, from the start).
                setTeasing(false);
                setStatus("idle");
              } else setStatus("ended");
              if (!teaser.current) report.current?.({ position: p.getDuration(), duration: p.getDuration(), playing: false, ended: true });
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
    // Their first tap: sound on, from the beginning (also when autoplay was blocked).
    if (teaser.current) {
      teaser.current = false;
      setTeasing(false);
      p.unMute();
      setMuted(false);
      p.seekTo(0, true);
    } else if (status === "ended") p.seekTo(0, true);
    p.playVideo();
  };
  const toggle = () => (status === "playing" && !teasing ? player.current?.pauseVideo() : play());
  // A tap on the picture while the bar is hidden only brings the bar back
  // (as on YouTube); with it showing, the tap pauses.
  const tapPicture = () => {
    if (status === "playing" && !teasing && !barShown) wake();
    else toggle();
  };
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

  const showCover = status !== "playing" && !(status === "ended" && endCta);
  // The phone can pause a silent autoplay by itself (low-power mode): then
  // it's just Play, which starts it from the beginning with sound.
  const bar = status !== "idle" && status !== "ended" && !teasing && (barShown || status !== "playing");
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;

  return (
    <Frame frameRef={frame} onPointerMove={(e) => { if (e.pointerType === "mouse" && status === "playing") wake(); }}>
      {/* YouTube pins its title bar, "AI" button, "More videos" strip and logo
          to the top and bottom edges of its own frame. Making that frame twice
          as tall as the box (centred) keeps the video exactly filling the box,
          and pushes those strips into the hidden part. */}
      <Box ref={holder} sx={{ position: "absolute", inset: 0, "& iframe": { top: "-50% !important", bottom: "auto !important", height: "200% !important" } }} />

      {/* Our layer over YouTube's: taps go to us, so YouTube's own menus,
          title and suggested videos never appear. */}
      <ButtonBase
        onClick={tapPicture}
        disabled={!ready}
        aria-label={teasing ? "Turn on sound" : status === "playing" ? "Pause" : status === "ended" ? "Watch again" : "Play"}
        sx={{ position: "absolute", inset: 0, bottom: bar ? 44 : 0, display: "block", cursor: ready ? "pointer" : "default" }}
      >
        {teasing && status === "playing" && <SoundBadge accent={accent} />}
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
            {autoplay && teaser.current && status !== "ended" ? (
              // Meant to start by itself: nothing while it's starting, then
              // (if the phone wouldn't) the same box as the sound badge.
              startWaited || status === "paused" ? <SoundBadge accent={accent} blocked /> : null
            ) : (
              <Box sx={{ width: 72, height: 72, borderRadius: "50%", bgcolor: accent, color: onAccent, display: "grid", placeItems: "center", boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>
                {status === "ended" ? <ReplayRoundedIcon sx={{ fontSize: 40 }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 48 }} />}
              </Box>
            )}
            {status === "ended" && <Typography sx={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>Watch again</Typography>}
            {status === "idle" && dur > 0 && (
              <Box sx={{ position: "absolute", right: 10, bottom: 10, bgcolor: "rgba(0,0,0,.7)", color: "#fff", fontSize: 12.5, fontWeight: 600, px: 0.75, py: 0.25, borderRadius: "4px" }}>
                {clock(dur)}
              </Box>
            )}
          </Box>
        )}
      </ButtonBase>

      {status === "ended" && endCta && <EndOverlay accent={accent} cta={endCta} onReplay={play} />}

      {/* How far in, along the top: it moves quickly at first and slower
          later (1 - (1 - p)²), so the video feels shorter than it is. The
          real position stays on the bar's own slider. */}
      {status === "playing" && !teasing && (
        <Box sx={{ position: "absolute", left: 0, right: 0, top: 0, height: 5, bgcolor: "rgba(255,255,255,.28)", pointerEvents: "none", zIndex: 1 }}>
          <Box sx={{ height: "100%", width: `${(1 - (1 - pct / 100) ** 2) * 100}%`, bgcolor: accent, transition: "width 1s linear" }} />
        </Box>
      )}

      {/* Slim bar: play/pause, progress (tap to jump), time, sound, full screen. */}
      {bar && (
        <Box onPointerDown={wake} sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 44, display: "flex", alignItems: "center", gap: 0.5, px: 0.5, bgcolor: "rgba(0,0,0,.75)", color: "#fff" }}>
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
