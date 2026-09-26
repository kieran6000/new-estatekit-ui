import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Toolbar,
  Typography,
} from "@mui/material";
import { usePostHog } from "@posthog/react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import { tokens } from "../theme";
import { ADMIN_WHATSAPP } from "../lib/contact";
import { useLaunchChecklist, type LaunchItem } from "../hooks/useLaunchChecklist";

// The Launch tab: everything a new agent needs to do to go live, in order,
// each one tap to the exact field that finishes it. The tab disappears from
// the menu once every step is done (see AppShell).
export default function LaunchPage() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { ready, profile, items, done, total, complete, next, minutesLeft } = useLaunchChecklist();
  const first = (profile?.displayName || "").trim().split(/\s+/)[0];

  const tracked = useRef(false);
  useEffect(() => {
    if (!ready || tracked.current) return;
    tracked.current = true;
    posthog.capture(complete ? "launch_completed" : "launch_viewed", { done, total, next: next?.key ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function go(item: LaunchItem) {
    posthog.capture("launch_item_clicked", { item: item.key, done, total });
    if (item.whatsapp) window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(item.whatsapp)}`, "_blank", "noopener");
    else if (item.to) navigate(item.to);
  }

  const open = items.filter((i) => !i.done);
  const finished = items.filter((i) => i.done);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Launch</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 720, mx: "auto", p: { xs: 1.5, sm: 3 } }}>
        {!ready ? (
          <Skeleton variant="rounded" height={420} />
        ) : complete ? (
          <Card variant="outlined">
            <CardContent sx={{ textAlign: "center", py: 5 }}>
              <CheckCircleIcon sx={{ fontSize: 56, color: tokens.green }} />
              <Typography variant="h6" sx={{ mt: 1 }}>You're live{first ? `, ${first}` : ""}!</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
                Everything's set up. New leads land in Leads and on your WhatsApp.
              </Typography>
              <Button variant="contained" onClick={() => navigate("/leads")}>Go to my leads</Button>
            </CardContent>
          </Card>
        ) : (
          <Card variant="outlined">
            <CardContent sx={{ pb: "16px !important" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <RocketLaunchOutlinedIcon color="primary" />
                <Typography variant="h6">Let's get you live{first ? `, ${first}` : ""}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {done} of {total} done{minutesLeft ? ` · about ${minutesLeft} minutes left` : ""}
              </Typography>
              <LinearProgress variant="determinate" value={(done / total) * 100} sx={{ mt: 2, height: 6, borderRadius: 3 }} />
            </CardContent>

            <Divider />
            <List disablePadding>
              {open.map((item, i) => (
                <Box key={item.key}>
                  {i > 0 && <Divider component="li" />}
                  <ListItem sx={{ py: 1.5, gap: 1, alignItems: "flex-start", flexWrap: { xs: "wrap", sm: "nowrap" } }}>
                    <ListItemIcon sx={{ minWidth: 40, mt: 0.5 }}>
                      <RadioButtonUncheckedIcon color={item === next ? "primary" : "disabled"} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      secondary={item.hint}
                      slotProps={{ primary: { sx: { fontWeight: 500 } } }}
                      sx={{ my: 0.25, flex: "1 1 220px" }}
                    />
                    {item.cta && (
                      <Button
                        variant={item === next ? "contained" : "outlined"}
                        onClick={() => go(item)}
                        sx={{ flexShrink: 0, alignSelf: "center", ml: { xs: 5, sm: 0 } }}
                      >
                        {item.cta}
                      </Button>
                    )}
                  </ListItem>
                </Box>
              ))}
            </List>

            {finished.length > 0 && (
              <>
                <Divider />
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", px: 2, pt: 1.5 }}>
                  Done
                </Typography>
                <List dense disablePadding sx={{ pb: 1 }}>
                  {finished.map((item) => (
                    <ListItem key={item.key}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <CheckCircleIcon sx={{ color: tokens.green }} />
                      </ListItemIcon>
                      <ListItemText primary={item.label} slotProps={{ primary: { color: "text.secondary" } }} />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </Card>
        )}
      </Box>
    </Box>
  );
}
