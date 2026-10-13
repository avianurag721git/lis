import { useTenant } from "../modules/tenant/tenant.context";
import { FeatureKey } from "../modules/tenant/tenant.types";

type Props = {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export const FeatureGate = ({ feature, children, fallback = null }: Props): JSX.Element => {
  const { hasFeature } = useTenant();
  if (!hasFeature(feature)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};
