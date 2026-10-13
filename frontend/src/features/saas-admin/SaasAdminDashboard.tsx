import { useQuery } from "@tanstack/react-query";
import { Building2, DollarSign, FlaskConical, Users } from "lucide-react";
import { SkeletonStatGrid } from "../../components/ui/Skeleton";
import { saasAdminApi } from "./saasAdmin.service";

const StatCard = ({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}): JSX.Element => (
  <div className="glass-card flex items-center gap-3 !p-4">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-medical-cyan/10 text-medical-cyan">{icon}</div>
    <div>
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="text-xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  </div>
);

export const SaasAdminDashboard = (): JSX.Element => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["saas-overview"],
    queryFn: () => saasAdminApi.getOverview()
  });

  if (isLoading) return <SkeletonStatGrid count={5} />;
  if (error) return <p className="status-error">Failed to load overview.</p>;
  if (!data) return <></>;

  return (
    <section className="saas-overview">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Platform Overview</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Subscribed Labs" value={data.totalTenants} icon={<Building2 size={20} />} />
        <StatCard label="Active Tenants" value={data.activeTenants} icon={<Building2 size={20} />} />
        <StatCard label="MRR" value={`$${data.mrrUsd.toLocaleString()}`} icon={<DollarSign size={20} />} />
        <StatCard label="Active Users (30d)" value={data.totalActiveUsers} icon={<Users size={20} />} />
        <StatCard label="Sample Volume (30d)" value={data.totalSampleVolumeMonth} icon={<FlaskConical size={20} />} />
      </div>
    </section>
  );
};
