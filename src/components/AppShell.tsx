import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Drawer,
  Typography,
  useMediaQuery,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from "@mui/material";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import { tokens } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { useIsOperator } from "../hooks/useAutomations";
import DevTierToggle from "./DevTierToggle";

const RAIL_WIDTH = 236;

function activeSection(pathname: string): "leads" | "home" {
  return pathname.startsWith("/home") || pathname.startsWith("/courses") || pathname.startsWith("/lead-page") ? "home" : "leads";
}

function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "5px",
        background: tokens.primary,
        position: "relative",
        "&:before,&:after": { content: '""', position: "absolute", background: "#fff" },
        "&:before": { left: 0, right: 0, top: size / 3, height: "1.5px" },
        "&:after": { top: 0, bottom: 0, left: size / 3, width: "1.5px" },
      }}
    />
  );
}

export default function AppShell() {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isOperator } = useIsOperator();
  const section = activeSection(pathname);
  const initial = useMemo(() => (user?.phone || "?")[0].toUpperCase(), [user]);

  const navItems = [
    { key: "leads" as const, label: "Leads", icon: <ViewListRoundedIcon />, to: "/leads" },
    { key: "home" as const, label: "Home", icon: <HomeRoundedIcon />, to: "/home" },
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
              bgcolor: tokens.railBg,
              borderRight: `1px solid ${tokens.railBorder}`,
              p: "14px 10px",
            },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, color: "#fff", fontSize: 19, fontWeight: 600, px: 1.5, pb: 2 }}>
            <BrandMark /> EstateKit
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {navItems.map((item) => (
              <Box
                key={item.key}
                component="button"
                onClick={() => navigate(item.to)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.75,
                  px: 1.75,
                  py: 1.375,
                  borderRadius: "6px",
                  border: 0,
                  width: "100%",
                  textAlign: "left",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  color: section === item.key ? "#fff" : tokens.railInk,
                  bgcolor: section === item.key ? tokens.railActive : "transparent",
                  "&:hover": { bgcolor: section === item.key ? tokens.railActive : tokens.railHover, color: "#fff" },
                }}
              >
                {item.icon} {item.label}
              </Box>
            ))}
          </Box>
          {isOperator && (
            <Box
              component="button"
              onClick={() => navigate("/admin/automations")}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.75,
                px: 1.75,
                py: 1.375,
                mt: 0.5,
                borderRadius: "6px",
                border: 0,
                width: "100%",
                textAlign: "left",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                color: pathname.startsWith("/admin") ? "#fff" : tokens.railInk,
                bgcolor: pathname.startsWith("/admin") ? tokens.railActive : "transparent",
                "&:hover": { bgcolor: pathname.startsWith("/admin") ? tokens.railActive : tokens.railHover, color: "#fff" },
              }}
            >
              <SettingsSuggestRoundedIcon fontSize="small" /> Automations
            </Box>
          )}
          <Box sx={{ flex: 1 }} />
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.25, p: "12px 10px", borderTop: "1px solid #2a3543", color: tokens.railInk, fontSize: 13 }}
          >
            <Avatar sx={{ width: 30, height: 30, bgcolor: tokens.primary, fontSize: 14 }}>{initial}</Avatar>
            <Typography variant="body2" sx={{ color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.phone || "Agent"}
            </Typography>
            <Box
              component="button"
              onClick={() => signOut()}
              sx={{
                ml: "auto",
                border: 0,
                bgcolor: "transparent",
                color: "#8a97a8",
                fontSize: 12,
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Sign out
            </Box>
          </Box>
        </Drawer>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0, pb: isDesktop ? 0 : "56px" }}>
        <Outlet />
      </Box>

      {!isDesktop && (
        <Paper elevation={0} sx={{ position: "fixed", bottom: 0, left: 0, right: 0, borderTop: `1px solid ${tokens.divider}`, zIndex: 9 }}>
          <BottomNavigation showLabels value={section} onChange={(_e, v) => navigate(navItems.find((n) => n.key === v)!.to)} sx={{ height: 56 }}>
            {navItems.map((item) => (
              <BottomNavigationAction key={item.key} label={item.label} value={item.key} icon={item.icon} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
      <DevTierToggle />
    </Box>
  );
}
