import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  Typography,
  useMediaQuery,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import WebRoundedIcon from "@mui/icons-material/WebRounded";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useIsOperator } from "../hooks/useAutomations";
import { usePageviewTracking } from "../hooks/usePageviewTracking";
import { useRealtimeSubscriptions } from "../hooks/useRealtime";
import AccountSwitcher from "./AccountSwitcher";
import DevTierToggle from "./DevTierToggle";
import estateKitLogoWhite from "../assets/whitelogofull.png";

const RAIL_WIDTH = 240;

const NAV_ITEM_SX = {
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  px: 1.5,
  py: 1,
  borderRadius: "6px",
  border: 0,
  width: "100%",
  textAlign: "left" as const,
  fontSize: 13.5,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
};

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
  const initial = useMemo(() => (user?.phone || "?")[0].toUpperCase(), [user]);

  const mainNav = [
    ...(import.meta.env.DEV ? [{ key: "home", label: "Dashboard", icon: <HomeRoundedIcon sx={{ fontSize: 20 }} />, to: "/home" }] : []),
    { key: "leads", label: "Leads", icon: <ViewListRoundedIcon sx={{ fontSize: 20 }} />, to: "/leads" },
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
              bgcolor: "#111827",
              borderRight: "1px solid #1f2937",
              display: "flex",
              flexDirection: "column",
            },
          }}
        >
          {/* Logo */}
          <Box sx={{ px: 2, py: 1.75 }}>
            <Box component="img" src={estateKitLogoWhite} alt="EstateKit" sx={{ height: 24, display: "block" }} />
          </Box>

          {/* Account switcher */}
          {isOperator && (
            <Box sx={{ px: 1.25 }}>
              <AccountSwitcher />
            </Box>
          )}

          <Divider sx={{ borderColor: "#1f2937", mx: 1.25, my: 0.75 }} />

          {/* Main nav */}
          <Box sx={{ px: 1.25, display: "flex", flexDirection: "column", gap: 0.25 }}>
            {mainNav.map((item) => {
              const active = section === item.key;
              return (
                <Box
                  key={item.key}
                  component="button"
                  onClick={() => navigate(item.to)}
                  sx={{
                    ...NAV_ITEM_SX,
                    color: active ? "#fff" : "#9ca3af",
                    bgcolor: active ? "#2563eb" : "transparent",
                    "&:hover": {
                      bgcolor: active ? "#2563eb" : "#1f2937",
                      color: "#fff",
                    },
                  }}
                >
                  {item.icon}
                  {item.label}
                </Box>
              );
            })}
          </Box>

          {/* Tools section */}
          {toolsNav.length > 0 && (
            <>
              <Divider sx={{ borderColor: "#1f2937", mx: 1.25, my: 0.75 }} />
              <Box sx={{ px: 1.25, display: "flex", flexDirection: "column", gap: 0.25 }}>
                {toolsNav.map((item) => {
                  const active = section === item.key;
                  return (
                    <Box
                      key={item.key}
                      component="button"
                      onClick={() => navigate(item.to)}
                      sx={{
                        ...NAV_ITEM_SX,
                        color: active ? "#fff" : "#9ca3af",
                        bgcolor: active ? "#2563eb" : "transparent",
                        "&:hover": {
                          bgcolor: active ? "#2563eb" : "#1f2937",
                          color: "#fff",
                        },
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </Box>
                  );
                })}
              </Box>
            </>
          )}

          <Box sx={{ flex: 1 }} />

          {/* Account button at bottom */}
          <Divider sx={{ borderColor: "#1f2937" }} />
          <Box
            component="button"
            onClick={() => navigate("/account")}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              p: "10px 14px",
              color: section === "account" ? "#fff" : "#9ca3af",
              bgcolor: section === "account" ? "#2563eb" : "transparent",
              fontSize: 13,
              border: 0,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              "&:hover": { bgcolor: section === "account" ? "#2563eb" : "#1f2937", color: "#fff" },
            }}
          >
            <Avatar sx={{ width: 28, height: 28, bgcolor: "#374151", fontSize: 13, fontWeight: 600 }}>{initial}</Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.phone || "Agent"}
              </Typography>
            </Box>
            <AccountCircleRoundedIcon sx={{ fontSize: 18, opacity: 0.5 }} />
          </Box>
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
