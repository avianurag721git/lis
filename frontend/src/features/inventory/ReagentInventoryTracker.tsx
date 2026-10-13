import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import { NumberField } from "../../components/NumberField";
import { CatalogTest, ordersApi } from "../orders/orders.service";
import { inventoryApi, Reagent } from "./inventory.service";

const daysUntil = (isoDate: string): number => {
  const exp = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
};

const stockBadge = (
  r: Reagent
): { label: string; className: "badge-ok" | "badge-warn" | "badge-danger" } => {
  const days = daysUntil(r.expiryDate);
  if (days < 0 || r.remainingTests <= 0) return { label: "Expired / Empty", className: "badge-danger" };
  if (r.remainingTests <= r.reorderLevel) return { label: "Low stock", className: "badge-danger" };
  if (days <= 15) return { label: `Expires in ${days}d`, className: "badge-warn" };
  return { label: "OK", className: "badge-ok" };
};

export const ReagentInventoryTracker = (): JSX.Element => {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [vialCapacity, setVialCapacity] = useState(100);
  const [testsPerVial, setTestsPerVial] = useState(100);
  const [reorderLevel, setReorderLevel] = useState(20);
  const [unitCostRupees, setUnitCostRupees] = useState(0);
  const [supplierName, setSupplierName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [testId, setTestId] = useState("");
  const [instrumentCode, setInstrumentCode] = useState("");
  const [qtyVials, setQtyVials] = useState(2);
  const [msg, setMsg] = useState("");

  const { data: reagents = [], isLoading } = useQuery({
    queryKey: ["reagents"],
    queryFn: () => inventoryApi.listReagents()
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => inventoryApi.listPurchaseOrders()
  });

  const { data: catalog } = useQuery({
    queryKey: ["orders-catalog-for-reagents"],
    queryFn: () => ordersApi.catalog()
  });
  const tests: CatalogTest[] = catalog?.tests ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const reagent = await inventoryApi.createReagent({
        name,
        lotNumber,
        expiryDate,
        vialCapacity,
        testsPerVial,
        remainingTests: testsPerVial,
        reorderLevel,
        unitCostMinor: Math.round(unitCostRupees * 100),
        supplierName: supplierName || null,
        branchId: branchId || null,
        testId: testId || null,
        instrumentCode: instrumentCode || null
      });
      if (qtyVials > 0) {
        await inventoryApi.createPurchaseOrder({
          reagentId: reagent.id,
          reagentName: name,
          lotNumber,
          quantityVials: qtyVials,
          unitCostMinor: Math.round(unitCostRupees * 100),
          supplierName: supplierName || null,
          notes: "Logged with new stock receipt"
        });
      }
      return reagent;
    },
    onSuccess: async () => {
      setMsg("Stock & draft PO saved.");
      setModalOpen(false);
      setName("");
      setLotNumber("");
      await qc.invalidateQueries({ queryKey: ["reagents"] });
      await qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Save failed")
  });

  const sorted = useMemo(
    () =>
      [...reagents].sort((a, b) => {
        const ba = stockBadge(a).className;
        const bb = stockBadge(b).className;
        const rank = (c: string) => (c === "badge-danger" ? 0 : c === "badge-warn" ? 1 : 2);
        return rank(ba) - rank(bb);
      }),
    [reagents]
  );

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div>
      <div className="wallet-badge-row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
          Log new stock / Purchase order
        </button>
        {msg ? <span className="text-muted">{msg}</span> : null}
      </div>

      <div className="card table-scroll">
        <h2 className="card-title">Reagent inventory tracker</h2>
        {isLoading ? <p>Loading…</p> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>Reagent</th>
              <th>Lot</th>
              <th>Expiry</th>
              <th>Consumption</th>
              <th>Supplier</th>
              <th>Instrument</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const badge = stockBadge(r);
              const capacity = Math.max(1, r.testsPerVial || r.vialCapacity);
              const pct = Math.min(100, Math.round((r.remainingTests / capacity) * 100));
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.branchId ? <div className="text-muted" style={{ fontSize: 11 }}>{r.branchId}</div> : null}
                  </td>
                  <td>{r.lotNumber}</td>
                  <td>{r.expiryDate}</td>
                  <td style={{ minWidth: 140 }}>
                    <div className="stock-bar">
                      <div
                        className={`stock-bar-fill ${badge.className === "badge-danger" ? "is-low" : ""}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {r.remainingTests} / {capacity} ({pct}%)
                    </span>
                  </td>
                  <td>{r.supplierName ?? "—"}</td>
                  <td>{r.instrumentCode ?? "—"}</td>
                  <td>
                    <span className={`inv-badge ${badge.className}`}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {reagents.length === 0 && !isLoading ? (
          <p className="text-muted">No lots yet. Stock auto-deducts on PROCESSING / TECHNICIAN_APPROVED.</p>
        ) : null}
      </div>

      {purchaseOrders.length > 0 ? (
        <div className="card table-scroll" style={{ marginTop: 12 }}>
          <h2 className="card-title">Purchase orders</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Reagent</th>
                <th>Qty vials</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.slice(0, 20).map((po) => (
                <tr key={po.id}>
                  <td>{po.poNumber}</td>
                  <td>{po.reagentName}</td>
                  <td>{po.quantityVials}</td>
                  <td>{po.status}</td>
                  <td>{po.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Log new stock / Purchase order"
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="reagent-stock-form" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Save lot + draft PO"}
            </button>
          </>
        }
      >
        <form id="reagent-stock-form" onSubmit={onSubmit}>
          <div className="form-grid">
                <label className="form-label">
                  Name
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label className="form-label">
                  Lot
                  <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} required />
                </label>
                <label className="form-label">
                  Expiry
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
                </label>
                <label className="form-label">
                  Vial capacity
                  <NumberField
                    min={1}
                    value={vialCapacity}
                    emptyValue={1}
                    onValueChange={setVialCapacity}
                  />
                </label>
                <label className="form-label">
                  Tests per vial
                  <NumberField
                    min={1}
                    value={testsPerVial}
                    emptyValue={1}
                    onValueChange={setTestsPerVial}
                  />
                </label>
                <label className="form-label">
                  Reorder level
                  <NumberField
                    min={0}
                    value={reorderLevel}
                    onValueChange={setReorderLevel}
                  />
                </label>
                <label className="form-label">
                  Unit cost (₹)
                  <NumberField
                    min={0}
                    value={unitCostRupees}
                    onValueChange={setUnitCostRupees}
                  />
                </label>
                <label className="form-label">
                  Supplier
                  <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                </label>
                <label className="form-label">
                  Branch ID
                  <input value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="MAIN" />
                </label>
                <label className="form-label">
                  PO vials
                  <NumberField
                    min={1}
                    value={qtyVials}
                    emptyValue={1}
                    onValueChange={setQtyVials}
                  />
                </label>
                <label className="form-label">
                  Linked test
                  <select value={testId} onChange={(e) => setTestId(e.target.value)}>
                    <option value="">Any / FEFO</option>
                    {tests.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  Instrument
                  <input
                    value={instrumentCode}
                    onChange={(e) => setInstrumentCode(e.target.value)}
                    placeholder="SYS-XN-550"
                  />
                </label>
          </div>
        </form>
      </Modal>
    </div>
  );
};

/** @deprecated use ReagentInventoryTracker */
export const ReagentInventoryPanel = ReagentInventoryTracker;
