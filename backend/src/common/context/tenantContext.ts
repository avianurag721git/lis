import { AsyncLocalStorage } from "async_hooks";

type TenantStore = {
  tenantId: string;
};

const storage = new AsyncLocalStorage<TenantStore>();

export const runWithTenant = <T>(tenantId: string, fn: () => T): T => {
  return storage.run({ tenantId }, fn);
};

export const setActiveTenantId = (tenantId: string): void => {
  const store = storage.getStore();
  if (store) {
    store.tenantId = tenantId;
  }
};

export const getActiveTenantId = (): string | undefined => storage.getStore()?.tenantId;
