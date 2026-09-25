/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_HOST: string;
  readonly VITE_API_URL: string;
  /** Set by Vercel on every build: "production" | "preview" | "development". */
  readonly VITE_VERCEL_ENV?: string;
  /** Optional override; "preview" forces the preview banner. */
  readonly VITE_APP_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
