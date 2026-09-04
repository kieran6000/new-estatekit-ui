import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import WebRoundedIcon from "@mui/icons-material/WebRounded";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useIsOperator } from "../hooks/useAutomations";
import { usePageviewTracking } from "../hooks/usePageviewTracking";
import { useRealtimeSubscriptions } from "../hooks/useRealtime";
import { getMyProfile } from "../api/agentProfile";
import AccountSwitcher from "./AccountSwitcher";
import DevTierToggle from "./DevTierToggle";
import estateKitLogoWhite from "../assets/whitelogofull.png";

const RAIL_WIDTH = 240;

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}


function activeSection(pathname: string): string {
  if (pathname.startsWith("/lead-page")) return "mypage";
  if (pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/overview")) return "overview";
  if (pathname.startsWith("/admin")) return "automations";
  if (pathname.startsWith("/account")) return "account";
  return "leads";
}

export default function AppShell() {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: isOperator } = useIsOperator();
  const section = activeSection(pathname);
  usePageviewTracking();
  useRealtimeSubscriptions();
  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, enabled: !!user });
  const initial = useMemo(() => (user?.phone || "?")[0].toUpperCase(), [user]);

  const sidebarBg = profile?.sidebarColor || "#111827";
  const light = isLightColor(sidebarBg);
  const textColor = light ? "#111827" : "#fff";
  const mutedColor = light ? "#6b7280" : "#9ca3af";
  const dividerColor = light ? "#d1d5db" : "#1f2937";
  const hoverBg = light ? "rgba(0,0,0,0.06)" : "#1f2937";
  const avatarBg = light ? "#d1d5db" : "#374151";
  const logoSrc = profile?.sidebarLogoUrl || estateKitLogoWhite;

  const mainNav = [
    ...(import.meta.env.DEV ? [{ key: "home", label: "Dashboard", icon: <HomeRoundedIcon sx={{ fontSize: 20 }} />, to: "/home" }] : []),
    { key: "leads", label: "Leads", icon: <ViewListRoundedIcon sx={{ fontSize: 20 }} />, to: "/leads" },
    ...(isOperator ? [{ key: "overview", label: "Overview", icon: <DashboardRoundedIcon sx={{ fontSize: 20 }} />, to: "/overview" }] : []),
    { key: "mypage", label: "Sites", icon: <WebRoundedIcon sx={{ fontSize: 20 }} />, to: "/lead-page" },
  ];

  const toolsNav = [
    ...(isOperator ? [{ key: "automations", label: "Automations", icon: <SettingsSuggestRoundedIcon sx={{ fontSize: 20 }} />, to: "/admin/automations" }] : []),
  ];

  const mobileNav = [
    { key: "leads", label: "Leads", icon: <ViewListRoundedIcon />, to: "/leads" },
    { key: "mypage", label: "Sites", icon: <WebRoundedIcon />, to: "/lead-page" },
    { key: "account", label: "Account", icon: <AccountCircleRoundedIcon />, to: "/account" },
  ];

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {isDesktop && (
        <Drawer
          variant="permanent"
          sx={{
            width: RAIL_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: RAIL_WIDTH,
              boxSizing: "border-box",
              bgcolor: sidebarBg,
              borderRight: `1px solid ${dividerColor}`,
              display: "flex",
              flexDirection: "column",
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.75 }}>
            <Box component="img" src={logoSrc} alt="EstateKit" sx={{ height: 24, display: "block", maxWidth: "100%", objectFit: "contain" }} />
          </Box>

          {isOperator && (
            <Box sx={{ px: 1.25 }}>
              <AccountSwitcher />
            </Box>
          )}

          <Divider sx={{ borderColor: dividerColor, mx: 1.25, my: 0.75 }} />

          <List disablePadding sx={{ px: 1.25 }}>
            {mainNav.map((item) => {
              const active = section === item.key;
              return (
                <ListItem key={item.key} disablePadding>
                  <ListItemButton
                    selected={active}
                    onClick={() => navigate(item.to)}
                    sx={{
                      borderRadius: "6px",
                      py: 0.75,
                      mb: 0.25,
                      color: active ? textColor : mutedColor,
                      "&.Mui-selected": { bgcolor: "#2563eb", color: "#fff", "&:hover": { bgcolor: "#2563eb" } },
                      "&:hover": { bgcolor: hoverBg, color: textColor },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: 500 } } }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          {toolsNav.length > 0 && (
            <>
              <Divider sx={{ borderColor: dividerColor, mx: 1.25, my: 0.75 }} />
              <List disablePadding sx={{ px: 1.25 }}>
                {toolsNav.map((item) => {
                  const active = section === item.key;
                  return (
                    <ListItem key={item.key} disablePadding>
                      <ListItemButton
                        selected={active}
                        onClick={() => navigate(item.to)}
                        sx={{
                          borderRadius: "6px",
                          py: 0.75,
                          mb: 0.25,
                          color: active ? textColor : mutedColor,
                          "&.Mui-selected": { bgcolor: "#2563eb", color: "#fff", "&:hover": { bgcolor: "#2563eb" } },
                          "&:hover": { bgcolor: hoverBg, color: textColor },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: 500 } } }} />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </>
          )}

          <Box sx={{ flex: 1 }} />

          <Divider sx={{ borderColor: dividerColor }} />
          <List disablePadding>
            <ListItem disablePadding>
              <ListItemButton
                selected={section === "account"}
                onClick={() => navigate("/account")}
                sx={{
                  py: 1.25,
                  px: 1.75,
                  color: section === "account" ? textColor : mutedColor,
                  "&.Mui-selected": { bgcolor: "#2563eb", color: "#fff", "&:hover": { bgcolor: "#2563eb" } },
                  "&:hover": { bgcolor: hoverBg, color: textColor },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                  <Avatar sx={{ width: 28, height: 28, bgcolor: avatarBg, fontSize: 13, fontWeight: 600 }}>{initial}</Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={user?.phone || "Agent"}
                  slotProps={{ primary: { sx: { fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } } }}
                />
                <AccountCircleRoundedIcon sx={{ fontSize: 18, opacity: 0.5 }} />
              </ListItemButton>
            </ListItem>
          </List>
        </Drawer>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0, pb: isDesktop ? 0 : "56px" }}>
        <Outlet />
      </Box>

      {!isDesktop && (
        <Paper elevation={0} sx={{ position: "fixed", bottom: 0, left: 0, right: 0, borderTop: `1px solid ${tokens.divider}`, zIndex: 9 }}>
          <BottomNavigation
            showLabels
            value={section}
            onChange={(_e, v) => {
              const item = mobileNav.find((n) => n.key === v);
              if (item) navigate(item.to);
            }}
            sx={{ height: 56 }}
          >
            {mobileNav.map((item) => (
              <BottomNavigationAction key={item.key} label={item.label} value={item.key} icon={item.icon} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
      {import.meta.env.DEV && <DevTierToggle />}
    </Box>
  );
}
