import { useEffect, useState } from "react";
import { getHealthStatus, HealthStatus } from "../services/health.service";

type UseHealthStatusResult = {
  loading: boolean;
  data: HealthStatus | null;
  error: string | null;
};

export const useHealthStatus = (): UseHealthStatusResult => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchStatus = async (): Promise<void> => {
      try {
        const response = await getHealthStatus();
        if (!mounted) {
          return;
        }
        setData(response);
      } catch (err: unknown) {
        if (!mounted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to fetch health status");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void fetchStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return { loading, data, error };
};
