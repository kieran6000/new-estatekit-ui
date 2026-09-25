import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { PostHogProvider } from "@posthog/react";
import "./index.css";
import App from "./App.tsx";
import { theme } from "./theme";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./hooks/useAuth";
import { SnackProvider } from "./hooks/useSnack";
import { TierProvider } from "./hooks/useTier";
import PreviewBanner from "./components/PreviewBanner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: "2026-05-30",
        // Anonymous visitors (e.g. My Page's public lead form before submit)
        // don't create a full person profile until identify() is called.
        person_profiles: "identified_only",
        // Lead PII (names, phones, emails, addresses) lives in plain form
        // fields throughout this app and must never reach PostHog via
        // autocapture or session replay — mask text/values everywhere.
        mask_all_text: true,
        mask_all_element_attributes: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
      }}
    >
      <ThemeProvider theme={theme} defaultMode="light">
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TierProvider>
              <SnackProvider>
                <BrowserRouter>
                  <PreviewBanner />
                  <App />
                </BrowserRouter>
              </SnackProvider>
            </TierProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </PostHogProvider>
  </StrictMode>,
);
