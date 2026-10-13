import { SaasAdminDashboard } from "../features/saas-admin/SaasAdminDashboard";
import { TenantManagementTable } from "../features/saas-admin/TenantManagementTable";

export const SaasAdminPage = (): JSX.Element => {
  return (
    <div className="saas-admin-page">
      <h1>SaaS Platform Admin</h1>
      <p className="muted">Manage subscribed pathology labs, plans, and feature modules.</p>
      <SaasAdminDashboard />
      <TenantManagementTable />
    </div>
  );
};
