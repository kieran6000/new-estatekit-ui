import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";

// If a page crashes, show a plain message and a way out instead of a blank
// white screen. The technical detail goes to the console, never the screen.

interface Props {
  children: ReactNode;
  /** Smaller, inside the app (the menu stays usable around it). */
  inline?: boolean;
  /** Going somewhere else (a new address) clears the error. */
  resetKey?: string;
}

export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box
        role="alert"
        sx={{
          minHeight: this.props.inline ? 320 : "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          textAlign: "center",
          bgcolor: this.props.inline ? "transparent" : "background.default",
        }}
      >
        <Box sx={{ maxWidth: 360 }}>
          <Typography sx={{ fontSize: 19, fontWeight: 700 }}>This page didn't load properly</Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1, lineHeight: 1.5 }}>
            Check your signal and reload. Nothing you've saved is lost.
          </Typography>
          <Button variant="contained" size="large" onClick={() => window.location.reload()} sx={{ mt: 2.5, minWidth: 160, minHeight: 48 }}>
            Reload
          </Button>
        </Box>
      </Box>
    );
  }
}
