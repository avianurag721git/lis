import { patientsApi, type Patient } from "../modules/patients/patients.service";
import { ordersApi, type CatalogTest, type SampleDto } from "../features/orders/orders.service";
import { samplesApi } from "../features/samples/samples.service";

export type CommandResultType = "patient" | "order" | "sample" | "test" | "action";

export type CommandResult = {
  id: string;
  type: CommandResultType;
  title: string;
  subtitle?: string;
  href?: string;
  action?: string;
  score: number;
};

const fuzzyScore = (query: string, target: string): number => {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 40 : 0;
};

const bestScore = (query: string, ...fields: (string | null | undefined)[]): number =>
  Math.max(0, ...fields.map((f) => fuzzyScore(query, f ?? "")));

let catalogCache: CatalogTest[] | null = null;
let samplesCache: SampleDto[] | null = null;
let cacheTs = 0;
const CACHE_TTL = 30_000;

const getCatalog = async (): Promise<CatalogTest[]> => {
  if (catalogCache && Date.now() - cacheTs < CACHE_TTL) return catalogCache;
  const { tests } = await ordersApi.catalog();
  catalogCache = tests;
  cacheTs = Date.now();
  return tests;
};

const getSamples = async (): Promise<SampleDto[]> => {
  if (samplesCache && Date.now() - cacheTs < CACHE_TTL) return samplesCache;
  samplesCache = await samplesApi.list();
  cacheTs = Date.now();
  return samplesCache;
};

export const QUICK_ACTIONS: CommandResult[] = [
  {
    id: "action-book-order",
    type: "action",
    title: "Book New Order",
    subtitle: "Register patient & create booking",
    href: "/orders",
    action: "book-order",
    score: 100
  },
  {
    id: "action-scan-sample",
    type: "action",
    title: "Scan Sample Tube",
    subtitle: "Lab receiving desk — barcode scan",
    href: "/lab-receiving",
    action: "scan-sample",
    score: 100
  },
  {
    id: "action-result-grid",
    type: "action",
    title: "Open Result Grid",
    subtitle: "Technician result entry",
    href: "/lab-results",
    action: "result-grid",
    score: 100
  },
  {
    id: "action-pathologist-queue",
    type: "action",
    title: "Pathologist Approval Queue",
    subtitle: "Review & sign-out reports",
    href: "/pathologist",
    action: "pathologist-queue",
    score: 100
  },
  {
    id: "action-revenue-report",
    type: "action",
    title: "Generate Daily Revenue Report",
    subtitle: "Billing & cashier dashboard",
    href: "/billing",
    action: "revenue-report",
    score: 100
  }
];

export const commandSearch = async (query: string): Promise<CommandResult[]> => {
  const q = query.trim();
  if (!q) {
    return QUICK_ACTIONS;
  }

  const results: CommandResult[] = [];

  for (const action of QUICK_ACTIONS) {
    const score = bestScore(q, action.title, action.subtitle);
    if (score > 0) results.push({ ...action, score });
  }

  try {
    const patients = await patientsApi.list(q);
    for (const p of patients.slice(0, 8)) {
      const score = bestScore(q, p.name, p.phone, p.uhid, p.patientCode);
      if (score > 0) {
        results.push({
          id: `patient-${p.id}`,
          type: "patient",
          title: p.name,
          subtitle: [p.uhid ?? p.patientCode, p.phone].filter(Boolean).join(" · "),
          href: `/patients?q=${encodeURIComponent(p.name)}`,
          score
        });
      }
    }
  } catch {
    /* offline */
  }

  try {
    const [tests, samples] = await Promise.all([getCatalog(), getSamples()]);
    for (const t of tests) {
      const score = bestScore(q, t.name, t.code);
      if (score > 0) {
        results.push({
          id: `test-${t.id}`,
          type: "test",
          title: t.name,
          subtitle: t.code ? `Code: ${t.code}` : "Lab test",
          href: "/settings/catalog",
          score: score - 5
        });
      }
    }
    for (const s of samples) {
      const score = bestScore(q, s.barcode, s.id);
      if (score > 0) {
        results.push({
          id: `sample-${s.id}`,
          type: "sample",
          title: s.barcode,
          subtitle: `Sample · ${s.status.replace(/_/g, " ")}`,
          href: "/lab-receiving",
          score
        });
      }
    }
  } catch {
    /* offline */
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 12);
};

export const invalidateCommandCache = (): void => {
  catalogCache = null;
  samplesCache = null;
  cacheTs = 0;
};

export type { Patient };
