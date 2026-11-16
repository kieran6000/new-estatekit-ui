import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./hooks/useAuth";
import { useIsOperator } from "./hooks/useAutomations";
import { amIOnboarded, getMyAccountStatus } from "./api/agentProfile";
import LoginPage from "./pages/LoginPage";
import { getActiveAgentIdSync } from "./api/_client";
import { useAdminAccess } from "./hooks/useAdminAccess";
import { lazyPage } from "./lib/lazyPage";

// Each page downloads the first time it's opened (see lib/lazyPage), and so
// does the app's frame (menu, account switcher): a seller opening a lead
// form downloads none of the dashboard.
const load = {
  AppShell: () => import("./components/AppShell"),
  AccountPausedPage: () => import("./pages/AccountPausedPage"),
  WelcomePage: () => import("./pages/WelcomePage"),
  LeadsPage: () => import("./pages/LeadsPage"),
  TeamPipelinePage: () => import("./pages/TeamPipelinePage"),
  TeamReportPage: () => import("./pages/TeamReportPage"),
  CallBookingPage: () => import("./pages/CallBookingPage"),
  LeadDetailPage: () => import("./pages/LeadDetailPage"),
  CalendarPage: () => import("./pages/CalendarPage"),
  HomePage: () => import("./pages/HomePage"),
  LeadPagePage: () => import("./pages/LeadPagePage"),
  UpgradePage: () => import("./pages/UpgradePage"),
  AdminAutomationsPage: () => import("./pages/AdminAutomationsPage"),
  ClientsPage: () => import("./pages/ClientsPage"),
  ClientDetailPage: () => import("./pages/ClientDetailPage"),
  AccountPage: () => import("./pages/AccountPage"),
  SetupPage: () => import("./pages/SetupPage"),
  LeadActionPage: () => import("./pages/LeadActionPage"),
  LeadPagePreviewPage: () => import("./pages/LeadPagePreviewPage"),
  ThankYouPage: () => import("./pages/ThankYouPage"),
  UnsubscribePage: () => import("./pages/UnsubscribePage"),
  PrivacyPolicyPage: () => import("./pages/PrivacyPolicyPage"),
  SignupPage: () => import("./pages/SignupPage"),
  OnboardingPage: () => import("./pages/OnboardingPage"),
  OnboardingNextPage: () => import("./pages/OnboardingNextPage"),
  SoldPage: () => import("./pages/SoldPage"),
  PlanPage: () => import("./pages/PlanPage"),
  WeeklyReportPage: () => import("./pages/WeeklyReportPage"),
  SharedReportPage: () => import("./pages/SharedReportPage"),
  ContractPage: () => import("./pages/ContractPage"),
  InvoicePage: () => import("./pages/InvoicePage"),
  CheckInPage: () => import("./pages/CheckInPage"),
  ContractsAdminPage: () => import("./pages/ContractsAdminPage"),
  WeeklyReportsAdminPage: () => import("./pages/WeeklyReportsAdminPage"),
  AuditLogPage: () => import("./pages/AuditLogPage"),
};
const AppShell = lazyPage(load.AppShell);
const AccountPausedPage = lazyPage(load.AccountPausedPage);
const WelcomePage = lazyPage(load.WelcomePage);
const LeadsPage = lazyPage(load.LeadsPage);
const TeamPipelinePage = lazyPage(load.TeamPipelinePage);
const TeamReportPage = lazyPage(load.TeamReportPage);
const CallBookingPage = lazyPage(load.CallBookingPage);
const LeadDetailPage = lazyPage(load.LeadDetailPage);
const CalendarPage = lazyPage(load.CalendarPage);
const HomePage = lazyPage(load.HomePage);
const LeadPagePage = lazyPage(load.LeadPagePage);
const UpgradePage = lazyPage(load.UpgradePage);
const AdminAutomationsPage = lazyPage(load.AdminAutomationsPage);
const ClientsPage = lazyPage(load.ClientsPage);
const ClientDetailPage = lazyPage(load.ClientDetailPage);
const AccountPage = lazyPage(load.AccountPage);
const SetupPage = lazyPage(load.SetupPage);
const LeadActionPage = lazyPage(load.LeadActionPage);
const LeadPagePreviewPage = lazyPage(load.LeadPagePreviewPage);
const ThankYouPage = lazyPage(load.ThankYouPage);
const UnsubscribePage = lazyPage(load.UnsubscribePage);
const PrivacyPolicyPage = lazyPage(load.PrivacyPolicyPage);
const SignupPage = lazyPage(load.SignupPage);
const OnboardingPage = lazyPage(load.OnboardingPage);
const OnboardingNextPage = lazyPage(load.OnboardingNextPage);
const SoldPage = lazyPage(load.SoldPage);
const PlanPage = lazyPage(load.PlanPage);
const WeeklyReportPage = lazyPage(load.WeeklyReportPage);
const SharedReportPage = lazyPage(load.SharedReportPage);
const ContractPage = lazyPage(load.ContractPage);
const InvoicePage = lazyPage(load.InvoicePage);
const CheckInPage = lazyPage(load.CheckInPage);
const ContractsAdminPage = lazyPage(load.ContractsAdminPage);
const WeeklyReportsAdminPage = lazyPage(load.WeeklyReportsAdminPage);
const AuditLogPage = lazyPage(load.AuditLogPage);

/** Signed in, the frame and the page being opened download side by side
 *  (not the page only after the frame). */
const PAGE_FOR_PATH: [string, () => Promise<unknown>][] = [
  ["/leads/", load.LeadDetailPage],
  ["/calendar", load.CalendarPage],
  ["/lead-page", load.LeadPagePage],
  ["/clients/", load.ClientDetailPage],
  ["/clients", load.ClientsPage],
  ["/admin/automations", load.AdminAutomationsPage],
  ["/account", load.AccountPage],
  ["/setup", load.SetupPage],
  ["/team-pipeline", load.TeamPipelinePage],
  ["/team", load.TeamReportPage],
];
function preloadFirstPage(pathname: string) {
  void load.AppShell().catch(() => {});
  const page = PAGE_FOR_PATH.find(([start]) => pathname.startsWith(start))?.[1] ?? load.LeadsPage;
  void page().catch(() => {});
}

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

/** Staff, or a self-run account (its own page only: it can't load anyone else's). */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { canAdmin, loading } = useAdminAccess();
  if (loading) return <Splash />;
  if (!canAdmin) return <Navigate to="/leads" replace />;
  return <>{children}</>;
}

function OperatorOnly({ children }: { children: React.ReactNode }) {
  const { data: isOperator, isLoading } = useIsOperator();
  if (isLoading) return <Splash />;
  if (!isOperator) return <Navigate to="/leads" replace />;
  return <>{children}</>;
}

/** Old /admin/clients/<id> links: on to the readable /clients/… address
 *  (the client page swaps the id for their name). */
/** /t/<code>: the short link in a to-do's WhatsApp. Opens it on the client's Check-ins tab. */
function ShortTodoLink() {
  const { code = "" } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ["noteByCode", code], queryFn: () => import("./api/checkins").then((m) => m.findNoteByCode(code)) });
  if (isLoading) return <Splash />;
  if (!data) return <Navigate to="/clients" replace />;
  return <Navigate to={`/clients/${data.agent_id}/checkins#note-${data.id}`} replace />;
}

function OldClientLink() {
  const { agentId = "" } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/clients/${agentId}/overview${search}`} replace />;
}

/** Staff working in a client: their settings are on the client's page, so
 *  /account goes there (one place, not two). Your own account and agents
 *  keep this page. */
function AccountRoute() {
  const { user } = useAuth();
  const { data: isOperator } = useIsOperator();
  const active = getActiveAgentIdSync();
  if (isOperator && active && active !== user?.id) return <Navigate to={`/clients/${active}/settings`} replace />;
  return <AccountPage />;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  // Checks the logged-in user's own onboarding — not the active/managed agent,
  // so an operator viewing a not-yet-onboarded agent isn't sent to /welcome.
  const { data: onboarded, isLoading } = useQuery({ queryKey: ["amIOnboarded"], queryFn: amIOnboarded });
  if (isLoading) return <Splash />;
  if (onboarded === false) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();
  // A deactivated client still signed in gets the "account paused" screen.
  // (New sign-ins are already blocked; this covers open sessions.)
  const { data: myStatus } = useQuery({
    queryKey: ["myAccountStatus", user?.id],
    queryFn: getMyAccountStatus,
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const paused = !!user && !!myStatus?.deactivated && !myStatus.isOperator;
  useEffect(() => {
    if (user) preloadFirstPage(window.location.pathname);
  }, [user]);

  if (loading) return <Splash />;

  return (
    <Suspense fallback={<Splash />}>
    <Routes>
      {/* Public routes — no login required */}
      <Route path="/l/:leadId" element={<LeadActionPage />} />
      <Route path="/p/:slug" element={<LeadPagePreviewPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/unsubscribe/:leadId/:sig" element={<UnsubscribePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/start" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/onboarding/next" element={<OnboardingNextPage />} />
      <Route path="/sold/:agentId" element={<SoldPage />} />
      <Route path="/plan/sample/:agentId" element={<PlanPage />} />
      <Route path="/plan/general/:slug" element={<PlanPage />} />
      <Route path="/plan/:token" element={<PlanPage />} />
      <Route path="/r/:token" element={<SharedReportPage />} />
      <Route path="/c/:token" element={<ContractPage />} />
      <Route path="/contract/:token" element={<ContractPage />} />
      <Route path="/i/:token" element={<InvoicePage />} />
      <Route path="/call/sample/:agentId" element={<CallBookingPage />} />
      <Route path="/call/:token" element={<CallBookingPage />} />
      <Route path="/k/:token" element={<CheckInPage />} />

      {!user ? (
        <Route path="*" element={<LoginPage />} />
      ) : paused ? (
        <Route path="*" element={<AccountPausedPage />} />
      ) : (
        <>
          <Route path="/login" element={<Navigate to="/leads" replace />} />
          <Route path="/welcome" element={<WelcomePage />} />
          {/* A printable document, so no app shell around it. */}
          <Route path="/report/:agentId" element={<OperatorOnly><WeeklyReportPage /></OperatorOnly>} />
          <Route path="/report" element={<OperatorOnly><WeeklyReportPage /></OperatorOnly>} />
          <Route element={<OnboardingGate><AppShell /></OnboardingGate>}>
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/team-pipeline/:id" element={<TeamPipelinePage />} />
            <Route path="/team" element={<TeamReportPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            {/* Overview now lives on the client's page (Overview tab). */}
            <Route path="/overview" element={<OperatorOnly><Navigate to={`/clients/${getActiveAgentIdSync() ?? user?.id ?? ""}/overview`} replace /></OperatorOnly>} />
            {import.meta.env.DEV && <Route path="/home" element={<HomePage />} />}
            <Route path="/lead-page" element={<LeadPagePage />} />
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route
              path="/admin/automations/*"
              element={<AdminAutomationsPage />}
            />
            <Route path="/clients" element={<OperatorOnly><ClientsPage /></OperatorOnly>} />
            <Route path="/t/:code" element={<OperatorOnly><ShortTodoLink /></OperatorOnly>} />
            <Route path="/clients/:who/:tab?" element={<AdminOnly><ClientDetailPage /></AdminOnly>} />
            <Route path="/admin/clients" element={<Navigate to="/clients" replace />} />
            <Route path="/admin/clients/:agentId/*" element={<OldClientLink />} />
            <Route path="/admin/reports" element={<OperatorOnly><WeeklyReportsAdminPage /></OperatorOnly>} />
            <Route path="/admin/contracts" element={<OperatorOnly><ContractsAdminPage /></OperatorOnly>} />
            <Route path="/account" element={<AccountRoute />} />
            <Route path="/account/audit" element={<OperatorOnly><AuditLogPage /></OperatorOnly>} />
            <Route path="/setup" element={<SetupPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/leads" replace />} />
        </>
      )}
    </Routes>
    </Suspense>
  );
}
