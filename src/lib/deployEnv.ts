/**
 * Which deployment this build is running as.
 *
 * Vercel sets VITE_VERCEL_ENV on every Vite build: "production" for the live
 * site, "preview" for any other branch. VITE_APP_ENV can force "preview" for a
 * build Vercel didn't make. Anything unset or unrecognised counts as
 * production, so a missing variable can never make the live site look like a
 * preview.
 *
 * There is one database. A preview is the same data behind a different URL,
 * which is why it gets a banner rather than being treated as a sandbox.
 */
export type DeployEnv = "production" | "preview";

export function deployEnv(): DeployEnv {
  const explicit = import.meta.env.VITE_APP_ENV;
  if (explicit === "preview" || explicit === "staging") return "preview";
  return import.meta.env.VITE_VERCEL_ENV === "preview" ? "preview" : "production";
}

export const IS_PREVIEW = deployEnv() === "preview";
