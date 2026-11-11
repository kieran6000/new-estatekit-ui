import { describe, expect, it } from "vitest";
import { canPlayVideo, videoKind } from "./videoLink";

describe("video links", () => {
  it("YouTube, every shape", () => {
    for (const u of ["https://youtu.be/dQw4w9WgXcQ", "youtube.com/watch?v=dQw4w9WgXcQ&t=3", "https://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ?si=a", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]) {
      expect(videoKind(u)).toEqual({ type: "youtube", id: "dQw4w9WgXcQ" });
    }
  });

  it("Vimeo, public and unlisted", () => {
    expect(videoKind("https://vimeo.com/76979871")).toEqual({ type: "vimeo", id: "76979871", hash: undefined });
    expect(videoKind("vimeo.com/76979871/8272103f6e")).toEqual({ type: "vimeo", id: "76979871", hash: "8272103f6e" });
    expect(videoKind("https://player.vimeo.com/video/76979871?h=8272103f6e&badge=0")).toEqual({ type: "vimeo", id: "76979871", hash: "8272103f6e" });
    expect(videoKind("https://vimeo.com/channels/staffpicks/76979871")).toMatchObject({ type: "vimeo", id: "76979871" });
    expect(videoKind("https://vimeo.com/showcase/123/video/76979871")).toMatchObject({ type: "vimeo", id: "76979871" });
  });

  it("an embed code pasted whole", () => {
    expect(videoKind('<iframe src="https://player.vimeo.com/video/76979871?h=abc123" width="640"></iframe>')).toMatchObject({ type: "vimeo", id: "76979871" });
  });

  it("video files and Dropbox", () => {
    expect(videoKind("https://x.supabase.co/storage/v1/object/public/v/intro.mp4")).toEqual({ type: "file", src: "https://x.supabase.co/storage/v1/object/public/v/intro.mp4" });
    expect(videoKind("https://www.dropbox.com/scl/fi/abc/intro.mov?rlkey=k&dl=0")).toEqual({ type: "file", src: "https://www.dropbox.com/scl/fi/abc/intro.mov?rlkey=k&raw=1" });
  });

  it("other sites get their own player", () => {
    expect(videoKind("https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184")).toMatchObject({ type: "embed", site: "Loom", src: expect.stringContaining("loom.com/embed/0281766fa2d04bb788eaf19e65135184") });
    expect(videoKind("https://estatekit.wistia.com/medias/abc123xyz9")).toMatchObject({ site: "Wistia", src: "https://fast.wistia.net/embed/iframe/abc123xyz9?videoFoam=true" });
    expect(videoKind("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing")).toMatchObject({ site: "Google Drive", src: "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview" });
    expect(videoKind("https://www.facebook.com/estatekit/videos/123456789/")).toMatchObject({ site: "Facebook" });
    expect(videoKind("https://streamable.com/m0o1x")).toMatchObject({ site: "Streamable", src: "https://streamable.com/e/m0o1x" });
    expect(videoKind("https://www.tiktok.com/@agent/video/7234567890123456789")).toMatchObject({ site: "TikTok", tall: true });
    expect(videoKind("https://www.instagram.com/reel/Cx1abc/")).toMatchObject({ site: "Instagram", tall: true });
  });

  it("any other link is still taken", () => {
    expect(videoKind("https://somevideohost.com/v/123")).toEqual({ type: "embed", site: "somevideohost.com", src: "https://somevideohost.com/v/123" });
  });

  it("only refuses things that aren't links", () => {
    expect(canPlayVideo("")).toBe(false);
    expect(canPlayVideo("my video")).toBe(false);
    expect(canPlayVideo("javascript:alert(1)")).toBe(false);
  });
});
