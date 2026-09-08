import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useColorScheme } from "@mui/material/styles";
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
  Typography,
  useMediaQuery,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ContactsIcon from "@mui/icons-material/Contacts";
import ContactsOutlinedIcon from "@mui/icons-material/ContactsOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import HomeIcon from "@mui/icons-material/Home";
import WebOutlinedIcon from "@mui/icons-material/WebOutlined";
import WebIcon from "@mui/icons-material/Web";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SettingsIcon from "@mui/icons-material/Settings";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useIsOperator } from "../hooks/useAutomations";
import { usePageviewTracking } from "../hooks/usePageviewTracking";
import { useRealtimeSubscriptions } from "../hooks/useRealtime";
import { getMyProfile } from "../api/agentProfile";
import { getActiveAgentIdSync, setActiveAgent } from "../api/_client";
import AccountSwitcher from "./AccountSwitcher";
import DevTierToggle from "./DevTierToggle";
import estateKitLogoWhite from "../assets/whitelogofull.png";

const RAIL_WIDTH = 240;

function sRGBtoLin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  if (c.length < 6) return 0;
  const r = sRGBtoLin(parseInt(c.slice(0, 2), 16));
  const g = sRGBtoLin(parseInt(c.slice(2, 4), 16));
  const b = sRGBtoLin(parseInt(c.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightColor(hex: string): boolean {
  return relativeLuminance(hex) > 0.179;
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
  const queryClient = useQueryClient();
  const { data: isOperator } = useIsOperator();
  // Dark mode is operator-only. If a non-operator somehow has it set, snap back.
  const { mode, setMode } = useColorScheme();
  useEffect(() => {
    if (isOperator === false && mode === "dark") setMode("light");
  }, [isOperator, mode, setMode]);
  const section = activeSection(pathname);
  const activeAgentId = getActiveAgentIdSync();
  const isManagingOther = !!activeAgentId && activeAgentId !== user?.id;
  usePageviewTracking();
  useRealtimeSubscriptions();
  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, enabled: !!user, staleTime: 5 * 60_000 });
  const initial = useMemo(() => (user?.phone || "?")[0].toUpperCase(), [user]);

  const sidebarBg = profile?.sidebarColor || "#111827";
  const light = isLightColor(sidebarBg);
  const textColor = light ? "#111827" : "#ffffff";
  const mutedColor = light ? "#4b5563" : "#d1d5db";
  const dividerColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)";
  const hoverBg = light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
  const activeBg = light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.14)";
  const avatarBg = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)";
  const sectionLabel = light ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.4)";
  const logoSrc = profile?.sidebarLogoUrl || estateKitLogoWhite;

  const SZ = 20;
  const agentNav = [
    ...(import.meta.env.DEV ? [{ key: "home", label: "Dashboard", icon: <HomeOutlinedIcon sx={{ fontSize: SZ }} />, activeIcon: <HomeIcon sx={{ fontSize: SZ }} />, to: "/home" }] : []),
    { key: "leads", label: "Leads", icon: <ContactsOutlinedIcon sx={{ fontSize: SZ }} />, activeIcon: <ContactsIcon sx={{ fontSize: SZ }} />, to: "/leads" },
    { key: "mypage", label: "Forms", icon: <WebOutlinedIcon sx={{ fontSize: SZ }} />, activeIcon: <WebIcon sx={{ fontSize: SZ }} />, to: "/lead-page" },
  ];

  const adminNav = [
    { key: "overview", label: "Overview", icon: <DashboardOutlinedIcon sx={{ fontSize: SZ }} />, activeIcon: <DashboardIcon sx={{ fontSize: SZ }} />, to: "/overview" },
    { key: "automations", label: "Automations", icon: <SettingsOutlinedIcon sx={{ fontSize: SZ }} />, activeIcon: <SettingsIcon sx={{ fontSize: SZ }} />, to: "/admin/automations" },
  ];

  const navButtonSx = (active: boolean) => ({
    borderRadius: "6px",
    py: 0.75,
    mb: 0.25,
    color: active ? textColor : mutedColor,
    fontWeight: active ? 600 : 400,
    "&.Mui-selected": { bgcolor: activeBg, color: textColor, "&:hover": { bgcolor: activeBg } },
    "&:hover": { bgcolor: hoverBg, color: textColor },
  });

  const mobileNav = [
    { key: "leads", label: "Leads", icon: <ContactsOutlinedIcon />, activeIcon: <ContactsIcon />, to: "/leads" },
    { key: "mypage", label: "Forms", icon: <WebOutlinedIcon />, activeIcon: <WebIcon />, to: "/lead-page" },
    ...(isOperator ? [{ key: "overview", label: "Overview", icon: <DashboardOutlinedIcon />, activeIcon: <DashboardIcon />, to: "/overview" }] : []),
    { key: "account", label: "Account", icon: <AccountCircleOutlinedIcon />, activeIcon: <AccountCircleIcon />, to: "/account" },
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
            <Box component="img" src={logoSrc} alt="EstateKit" sx={{ height: 24, display: "block", maxWidth: "100%", objectFit: "contain", marginX: "auto" }} />
          </Box>

          {isOperator && (
            <Box sx={{ px: 1.25 }}>
              <AccountSwitcher />
            </Box>
          )}

          {isManagingOther && (
            <Box
              sx={{
                mx: 1.25,
                mt: 0.75,
                px: 1.25,
                py: 0.75,
                bgcolor: "#f59e0b22",
                border: "1px solid #f59e0b66",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#f59e0b", lineHeight: 1.3 }}>
                Managing: {profile?.displayName || "another agent"}
              </Typography>
              <Box
                component="button"
                onClick={() => {
                  setActiveAgent(null);
                  queryClient.invalidateQueries();
                  window.location.reload();
                }}
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#f59e0b",
                  bgcolor: "transparent",
                  border: "1px solid #f59e0b66",
                  borderRadius: "4px",
                  px: 0.75,
                  py: 0.25,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  "&:hover": { bgcolor: "#f59e0b22" },
                }}
              >
                Back
              </Box>
            </Box>
          )}

          <Divider sx={{ borderColor: dividerColor, mx: 1.25, my: 0.75 }} />

          <List disablePadding sx={{ px: 1.25 }}>
            {agentNav.map((item) => {
              const active = section === item.key;
              return (
                <ListItem key={item.key} disablePadding>
                  <ListItemButton selected={active} onClick={() => navigate(item.to)} sx={navButtonSx(active)}>
                    <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{active ? item.activeIcon : item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: active ? 600 : 500 } } }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          {isOperator && (
            <>
              <Divider sx={{ borderColor: dividerColor, mx: 1.25, my: 0.75 }} />
              <Typography sx={{ fontSize: 10, fontWeight: 600, color: sectionLabel, textTransform: "uppercase", letterSpacing: "0.08em", px: 2.25, pt: 0.5, pb: 0.25 }}>
                Admin
              </Typography>
              <List disablePadding sx={{ px: 1.25 }}>
                {adminNav.map((item) => {
                  const active = section === item.key;
                  return (
                    <ListItem key={item.key} disablePadding>
                      <ListItemButton selected={active} onClick={() => navigate(item.to)} sx={navButtonSx(active)}>
                        <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{active ? item.activeIcon : item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontSize: 13.5, fontWeight: active ? 600 : 500 } } }} />
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
                  "&.Mui-selected": { bgcolor: activeBg, color: textColor, "&:hover": { bgcolor: activeBg } },
                  "&:hover": { bgcolor: hoverBg, color: textColor },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                  <Avatar sx={{ width: 28, height: 28, bgcolor: avatarBg, fontSize: 13, fontWeight: 600, color: textColor }}>{initial}</Avatar>
                </ListItemIcon>
                <ListItemText
                  primary="Settings"
                  slotProps={{ primary: { sx: { fontSize: 13, fontWeight: 500 } } }}
                />
                {section === "account" ? (
                  <AccountCircleIcon sx={{ fontSize: 18, opacity: 0.5 }} />
                ) : (
                  <AccountCircleOutlinedIcon sx={{ fontSize: 18, opacity: 0.5 }} />
                )}
              </ListItemButton>
            </ListItem>
          </List>
        </Drawer>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0, pb: isDesktop ? 0 : "56px" }}>
        {!isDesktop && isOperator && (
          <Box sx={{ px: 1.5, py: 1, bgcolor: isManagingOther ? "#fef3c7" : "background.paper", borderBottom: `1px solid ${isManagingOther ? "#f59e0b66" : tokens.divider}` }}>
            <AccountSwitcher variant="light" />
          </Box>
        )}
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
              <BottomNavigationAction
                key={item.key}
                label={item.label}
                value={item.key}
                icon={section === item.key ? item.activeIcon : item.icon}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
      {import.meta.env.DEV && <DevTierToggle />}
    </Box>
  );
}
