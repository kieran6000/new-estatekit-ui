import { Navigate, Route, Routes } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./hooks/useAuth";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import LeadsPage from "./pages/LeadsPage";
import LeadDetailPage from "./pages/LeadDetailPage";
import OverviewPage from "./pages/OverviewPage";
import HomePage from "./pages/HomePage";
import LeadPagePage from "./pages/LeadPagePage";
import UpgradePage from "./pages/UpgradePage";
import AdminAutomationsPage from "./pages/AdminAutomationsPage";
import LeadActionPage from "./pages/LeadActionPage";

function Splash() {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress />
    </Box>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;

  return (
    <Routes>
      {/* Public — the WhatsApp lead-action link a call/reminder automation
       * sends. No login required, and deliberately not linked from anywhere
       * in the dashboard; reachable only by its direct URL. */}
      <Route path="/l/:leadId" element={<LeadActionPage />} />

      {!user ? (
        <Route path="*" element={<LoginPage />} />
      ) : (
        <>
          <Route path="/login" element={<Navigate to="/leads" replace />} />
          <Route element={<AppShell />}>
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/lead-page" element={<LeadPagePage />} />
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route path="/admin/automations" element={<AdminAutomationsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/leads" replace />} />
        </>
      )}
    </Routes>
  );
}
