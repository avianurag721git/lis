/**
 * Full validation of NABL clinical PDFs for every order with pathologist-verified results.
 * Run: npx ts-node --transpile-only src/scripts/validateNablReports.ts
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { env } from "../config/env";
import { ensureLabOpsSchema } from "../database/ensureLabOpsSchema";
import { db } from "../database/postgres";
import { nablPdfEngine, decryptReportBuffer } from "../modules/pdf-engine/nablPdf.engine";
import { coerceIsoDate, parseIsoDate } from "../common/age/patientAge";

type Check = { name: string; ok: boolean; detail?: string };

const extractPdfText = (pdf: Buffer): string => {
  const s = pdf.toString("binary");
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  let raw = "";
  while ((m = re.exec(s))) {
    const chunk = Buffer.from(m[1]!, "binary");
    try {
      raw += zlib.inflateSync(chunk).toString("latin1") + "\n";
    } catch {
      /* ignore non-flate */
    }
  }
  let text = "";
  for (const mm of raw.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    try {
      text += Buffer.from(mm[1]!, "hex").toString("utf8");
    } catch {
      /* ignore */
    }
  }
  return text;
};

const yearsBetween = (dobIso: string, asOf = new Date()): number => {
  const d = parseIsoDate(dobIso);
  if (!d) return NaN;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age -= 1;
  return age;
};

const validateText = (text: string, meta: { orderNumber: string; patientName: string; dob: string | null; ageYears: number | null }): Check[] => {
  const checks: Check[] = [];

  checks.push({
    name: "has_patient_name",
    ok: text.includes(meta.patientName),
    detail: meta.patientName
  });
  checks.push({
    name: "has_order_number",
    ok: text.includes(meta.orderNumber),
    detail: meta.orderNumber
  });
  checks.push({
    name: "has_end_of_report",
    ok: text.includes("End Of Report")
  });
  checks.push({
    name: "has_column_headers",
    ok: text.includes("Parameter") && text.includes("Biological Ref")
  });
  checks.push({
    name: "no_corrupt_dob_year_2001_from_string_slice",
    ok: !(meta.dob && meta.dob.startsWith("198") && text.includes("2001"))
  });
  checks.push({
    name: "no_full_localhost_verify_url",
    ok: !/localhost:\d+\/verify\//.test(text)
  });
  checks.push({
    name: "has_verify_cue",
    ok: text.includes("Verify online") || text.includes("Scan QR")
  });
  checks.push({
    name: "status_final",
    ok: text.includes("Final")
  });

  if (meta.dob) {
    const expectedAge = yearsBetween(meta.dob);
    const ageMatch = text.match(/(\d+)\s*Years/);
    const printedAge = ageMatch ? Number(ageMatch[1]) : null;
    const ok =
      printedAge == null || expectedAge == null || Number.isNaN(expectedAge)
        ? true
        : Math.abs(printedAge - expectedAge) <= 1;
    checks.push({
      name: "dob_age_consistent",
      ok,
      detail: `dob=${meta.dob} expected≈${expectedAge} printed=${printedAge}`
    });
    checks.push({
      name: "dob_year_printed",
      ok: text.includes(meta.dob.slice(0, 4)),
      detail: meta.dob
    });
  }

  // Heuristic: test titles should appear with Specimen nearby (left-flow content)
  const titleHits = [...text.matchAll(/([A-Z][A-Z0-9 /()\-]{5,80})Specimen:/g)];
  checks.push({
    name: "test_blocks_have_specimen",
    ok: titleHits.length > 0 || text.includes("Specimen:"),
    detail: `blocks=${titleHits.length}`
  });

  // Empty dash-only value rows are hard to detect in hex stream; flag obvious "—%" unit ghosts
  checks.push({
    name: "no_orphan_percent_after_emdash",
    ok: !/—%/.test(text) && !/-\s*%/.test(text)
  });

  return checks;
};

const inflatePdfStreams = (pdf: Buffer): string => {
  const s = pdf.toString("binary");
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  let raw = "";
  while ((m = re.exec(s))) {
    const chunk = Buffer.from(m[1]!, "binary");
    try {
      raw += zlib.inflateSync(chunk).toString("latin1") + "\n";
    } catch {
      /* ignore */
    }
  }
  return raw;
};

type TextEvent = { x: number; y: number; t: string };

const extractTextEvents = (pdf: Buffer): TextEvent[] => {
  const raw = inflatePdfStreams(pdf);
  const events: TextEvent[] = [];
  const re = /1 0 0 1 ([0-9.]+) ([0-9.]+) Tm([\s\S]{0,240})/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(raw))) {
    let t = "";
    for (const hx of mm[3]!.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      try {
        t += Buffer.from(hx[1]!, "hex").toString("utf8");
      } catch {
        /* ignore */
      }
    }
    if (t.trim()) events.push({ x: Number(mm[1]), y: Number(mm[2]), t });
  }
  return events;
};

/** Fail if section titles / Specimen lines are drawn with x > 80 (right-side bug). */
const validateTitleAlignment = (pdf: Buffer): Check => {
  const interesting = extractTextEvents(pdf).filter((e) =>
    /KIDNEY|LIPID|COMPLETE|LIVER|Specimen:|BIOCHEM|HEMATOL|Clinical significance/.test(e.t)
  );
  const bad = interesting.filter((e) => e.x > 80);
  return {
    name: "section_titles_left_aligned",
    ok: bad.length === 0 && interesting.length > 0,
    detail:
      bad.length > 0
        ? bad.map((b) => `x=${b.x.toFixed(1)}:${b.t.slice(0, 40)}`).join("; ")
        : `ok_titles=${interesting.length}`
  };
};

/**
 * PDFKit flips Y with `1 0 0 -1 0 841.89 cm`, so larger Tm y = higher on page.
 * Compare only stream-local predecessors (same page), not other pages' similar y values.
 */
const validateEndOfReportGap = (pdf: Buffer): Check => {
  const events = extractTextEvents(pdf);
  const eorIdx = events.findIndex((e) => e.t.includes("End Of Report"));
  if (eorIdx < 0) return { name: "end_of_report_gap", ok: false, detail: "marker missing" };
  const eor = events[eorIdx]!;
  // Walk backward in draw order until y jumps upward a lot (new page) or we leave the band
  let nearest: TextEvent | null = null;
  for (let i = eorIdx - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.y < eor.y - 5) continue; // text below EOR on same page (QR captions etc.)
    if (e.y - eor.y > 200) break; // crossed to a previous page's content
    if (!nearest || e.y - eor.y < nearest.y - eor.y) nearest = e;
  }
  if (!nearest) return { name: "end_of_report_gap", ok: true, detail: "no prior text on page" };
  const gap = nearest.y - eor.y;
  return {
    name: "end_of_report_gap",
    ok: gap >= 18,
    detail: `gap=${gap.toFixed(1)}pt (need ≥18) above=${nearest.t.slice(0, 32)}`
  };
};

const main = async (): Promise<void> => {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  await ensureLabOpsSchema();

  const orders = await db.query(
    `SELECT DISTINCT o.id AS order_id, o.order_number, o.tenant_id,
            p.name AS patient_name, p.date_of_birth, p.age_years,
            (SELECT lr.pathologist_user_id FROM lab_results lr
             WHERE lr.order_id = o.id AND lr.status = 'PATHOLOGIST_VERIFIED'
             ORDER BY lr.verified_at DESC NULLS LAST LIMIT 1) AS pathologist_user_id
     FROM order_bookings o
     JOIN patients p ON p.id = o.patient_id
     WHERE EXISTS (
       SELECT 1 FROM lab_results lr
       WHERE lr.order_id = o.id AND lr.status = 'PATHOLOGIST_VERIFIED'
     )
     ORDER BY o.order_number`
  );

  if (orders.rows.length === 0) {
    console.log("No pathologist-verified orders found.");
    process.exit(0);
  }

  const outDir = path.resolve(process.cwd(), "storage", "nabl-reports", "validation");
  await fs.promises.mkdir(outDir, { recursive: true });

  let failed = 0;
  console.log(`\nValidating ${orders.rows.length} verified order report(s)…\n`);

  for (const row of orders.rows) {
    const orderId = row.order_id as string;
    const tenantId = row.tenant_id as string;
    const userId = (row.pathologist_user_id as string | null) ?? "00000000-0000-4000-8000-000000000001";
    const dob = coerceIsoDate(row.date_of_birth as Date | string | null);

    process.stdout.write(`• ${row.order_number} (${orderId.slice(0, 8)}…) `);
    try {
      await nablPdfEngine.generateForOrder({ tenantId, userId, orderId });
      const { encrypted } = await nablPdfEngine.getEncryptedFile(tenantId, orderId);
      const pdf = decryptReportBuffer(encrypted);
      const pdfPath = path.join(outDir, `${row.order_number}.pdf`);
      await fs.promises.writeFile(pdfPath, pdf);

      const text = extractPdfText(pdf);
      const checks = [
        ...validateText(text, {
          orderNumber: String(row.order_number),
          patientName: String(row.patient_name),
          dob,
          ageYears: row.age_years != null ? Number(row.age_years) : null
        }),
        validateTitleAlignment(pdf),
        validateEndOfReportGap(pdf)
      ];
      const bad = checks.filter((c) => !c.ok);
      if (bad.length) {
        failed += 1;
        console.log("FAIL");
        for (const b of bad) {
          console.log(`    ✗ ${b.name}${b.detail ? ` — ${b.detail}` : ""}`);
        }
      } else {
        console.log(`OK (${checks.length} checks) → ${pdfPath}`);
      }
    } catch (err) {
      failed += 1;
      console.log("ERROR");
      console.log(`    ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. ${orders.rows.length - failed}/${orders.rows.length} passed.`);
  process.exit(failed > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
