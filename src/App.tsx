import { Navigate, Route, Routes } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./hooks/useAuth";
import { useIsOperator } from "./hooks/useAutomations";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import LeadsPage from "./pages/LeadsPage";
import LeadDetailPage from "./pages/LeadDetailPage";
import OverviewPage from "./pages/OverviewPage";
import HomePage from "./pages/HomePage";
import LeadPagePage from "./pages/LeadPagePage";
import UpgradePage from "./pages/UpgradePage";
import AdminAutomationsPage from "./pages/AdminAutomationsPage";
import AccountPage from "./pages/AccountPage";
import LeadActionPage from "./pages/LeadActionPage";
import LeadPagePreviewPage from "./pages/LeadPagePreviewPage";
import ThankYouPage from "./pages/ThankYouPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";

function Splash() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress />
    </Box>
  );
}

function OperatorOnly({ children }: { children: React.ReactNode }) {
  const { data: isOperator, isLoading } = useIsOperator();
  if (isLoading) return <Splash />;
  if (!isOperator) return <Navigate to="/leads" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;

  return (
    <Routes>
      {/* Public routes — no login required */}
      <Route path="/l/:leadId" element={<LeadActionPage />} />
      <Route path="/p/:slug" element={<LeadPagePreviewPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />

      {!user ? (
        <Route path="*" element={<LoginPage />} />
      ) : (
        <>
          <Route path="/login" element={<Navigate to="/leads" replace />} />
          <Route element={<AppShell />}>
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/overview" element={<OperatorOnly><OverviewPage /></OperatorOnly>} />
            {import.meta.env.DEV && <Route path="/home" element={<HomePage />} />}
            <Route path="/lead-page" element={<LeadPagePage />} />
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route
              path="/admin/automations"
              element={<AdminAutomationsPage />}
            />
            <Route path="/account" element={<AccountPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/leads" replace />} />
        </>
      )}
    </Routes>
  );
}
