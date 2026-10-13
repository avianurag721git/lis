import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "../layouts/MainLayout";
import { AccountPage } from "../pages/AccountPage";
import { AuditLogsPage } from "../pages/AuditLogsPage";
import { HomeLandingPage } from "../pages/HomeLandingPage";
import { LoginPage } from "../pages/LoginPage";
import { OperationsPage } from "../pages/OperationsPage";
import { CatalogPage } from "../pages/CatalogPage";
import { TenantSettingsPage } from "../pages/TenantSettingsPage";
import { RolePermissionsPage } from "../pages/RolePermissionsPage";
import { ProtectedRoute, PermissionRoute, SuperAdminRoute } from "./ProtectedRoute";
import { PatientsPage } from "../pages/PatientsPage";
import { OrderBookingPage } from "../pages/OrderBookingPage";
import { PhlebotomyPage } from "../pages/PhlebotomyPage";
import { LabReceivingPage } from "../pages/LabReceivingPage";
import { LabResultsPage } from "../pages/LabResultsPage";
import { PathologistPage } from "../pages/PathologistPage";
import { BillingPage } from "../pages/BillingPage";
import { B2BPage } from "../pages/B2BPage";
import { ReferralAnalyticsPage } from "../pages/ReferralAnalyticsPage";
import { InventoryQcPage } from "../pages/InventoryQcPage";
import { PublicVerifyPage } from "../pages/PublicVerifyPage";
import { PatientTrackPhlebPage } from "../pages/PatientTrackPhlebPage";
import { BYODKioskPage } from "../pages/BYODKioskPage";
import { SmartReportPage } from "../pages/SmartReportPage";
import { ReportViewPage } from "../pages/ReportViewPage";
import { TestStudioPage } from "../pages/TestStudioPage";
import { SaasAdminPage } from "../pages/SaasAdminPage";
import { SignupPage } from "../pages/SignupPage";
import { MachineInterfacingPage } from "../pages/MachineInterfacingPage";

export const AppRoutes = (props: { onOpenCommand?: () => void }): JSX.Element => {
  const { onOpenCommand } = props;
  const layout = <MainLayout {...(onOpenCommand ? { onOpenCommand } : {})} />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify/:orderId" element={<PublicVerifyPage />} />
      <Route path="/track-phleb/:bookingId" element={<PatientTrackPhlebPage />} />
      <Route path="/byod-kiosk" element={<BYODKioskPage />} />
      <Route path="/r/:token" element={<SmartReportPage />} />
      <Route path="/report-view/:passcode" element={<ReportViewPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={layout}>
          <Route path="/" element={<HomeLandingPage />} />
          <Route element={<PermissionRoute requiredPermission="ANALYTICS_VIEW" />}>
            <Route path="/analytics/referrals" element={<ReferralAnalyticsPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="SETTINGS_MANAGE" />}>
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/settings/catalog" element={<CatalogPage />} />
            <Route path="/settings/test-studio" element={<TestStudioPage />} />
            <Route path="/settings/tenant" element={<TenantSettingsPage />} />
            <Route path="/settings/permissions" element={<RolePermissionsPage />} />
            <Route path="/operations" element={<OperationsPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="BILLING_CREATE" />}>
            <Route path="/billing" element={<BillingPage />} />
            {/* Legacy demo payment desk → real cashier billing */}
            <Route path="/payments" element={<Navigate to="/billing" replace />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="B2B_WALLET_MANAGE" />}>
            <Route path="/b2b" element={<B2BPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission={["PATIENT_MANAGE", "ORDER_CREATE"]} />}>
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/orders" element={<OrderBookingPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="SAMPLE_COLLECT" />}>
            <Route path="/phlebotomy" element={<PhlebotomyPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="SAMPLE_RECEIVE" />}>
            <Route path="/lab-receiving" element={<LabReceivingPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="RESULT_ENTRY" />}>
            <Route path="/lab-results" element={<LabResultsPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="PATHOLOGIST_VERIFY" />}>
            <Route path="/pathologist" element={<PathologistPage />} />
            {/* Legacy demo report form → pathologist verify + distribute */}
            <Route path="/reports" element={<Navigate to="/pathologist" replace />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission={["REAGENT_MANAGE", "QC_MANAGE"]} />}>
            <Route path="/inventory-qc" element={<InventoryQcPage />} />
          </Route>
          <Route element={<PermissionRoute requiredPermission="QC_MANAGE" />}>
            <Route path="/instruments" element={<MachineInterfacingPage />} />
          </Route>
          <Route element={<SuperAdminRoute />}>
            <Route path="/saas-admin" element={<SaasAdminPage />} />
          </Route>
          <Route path="/account" element={<AccountPage />} />
        </Route>
      </Route>
    </Routes>
  );
};
