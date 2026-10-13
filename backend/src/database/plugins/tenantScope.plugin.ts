import { Schema, Query } from "mongoose";
import { getActiveTenantId } from "../../common/context/tenantContext";

const TENANT_SCOPED_MODELS = new Set(["Patient", "OrderBooking", "Sample", "LabResult", "TestCatalog"]);

type TenantScopedQuery = Query<unknown, unknown> & { options: { _bypassTenantScope?: boolean } };

const injectTenantFilter = (query: TenantScopedQuery): void => {
  if (query.options._bypassTenantScope) {
    return;
  }
  const tenantId = getActiveTenantId();
  if (!tenantId) {
    return;
  }
  const filter = query.getFilter();
  if (filter.tenantId === undefined) {
    query.where({ tenantId });
  }
};

const injectTenantOnWrite = (doc: { tenantId?: string; isNew?: boolean }): void => {
  if (doc.tenantId) {
    return;
  }
  const tenantId = getActiveTenantId();
  if (tenantId) {
    doc.tenantId = tenantId;
  }
};

/**
 * Mongoose plugin: automatically scopes reads/writes to `{ tenantId }` from AsyncLocalStorage.
 * Register on Patient, OrderBooking, Sample, LabResult, TestCatalog schemas.
 */
export const tenantScopePlugin = (schema: Schema): void => {
  schema.add({ tenantId: { type: String, required: true, index: true } });

  schema.pre(/^find/, function (this: TenantScopedQuery) {
    injectTenantFilter(this);
  });

  schema.pre("countDocuments", function (this: TenantScopedQuery) {
    injectTenantFilter(this);
  });

  schema.pre("updateOne", function (this: TenantScopedQuery) {
    injectTenantFilter(this);
  });

  schema.pre("updateMany", function (this: TenantScopedQuery) {
    injectTenantFilter(this);
  });

  schema.pre("deleteOne", function (this: TenantScopedQuery) {
    injectTenantFilter(this);
  });

  schema.pre("deleteMany", function (this: TenantScopedQuery) {
    injectTenantFilter(this);
  });

  schema.pre("save", function (this: { tenantId?: string }) {
    injectTenantOnWrite(this);
  });

  schema.statics.bypassTenantScope = function () {
    return this.find().setOptions({ _bypassTenantScope: true });
  };
};

export { TENANT_SCOPED_MODELS };
