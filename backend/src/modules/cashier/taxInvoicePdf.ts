import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { CashierInvoice, OrderBillLine } from "./cashier.types";

const invoicesDir = path.resolve(process.cwd(), "storage", "tax-invoices");

/** Helvetica has no ₹ glyph — use Rs. for clean PDF rendering. */
const money = (minor: number): string =>
  `Rs. ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(minor / 100)}`;

const PAGE = { left: 40, right: 555, width: 515 };

type BrandingInput = {
  primaryColor?: string;
  secondaryColor?: string;
  labHeaderAddress?: string;
  nablRegNo?: string;
  logoUrl?: string | null;
};

const drawBrandedHeader = (
  doc: PDFKit.PDFDocument,
  labName: string,
  branding: BrandingInput,
  labGstin: string
): void => {
  const primary = branding.primaryColor ?? "#0b5cab";
  const secondary = branding.secondaryColor ?? "#0f766e";
  const address =
    branding.labHeaderAddress?.trim() ||
    "Diagnostic Laboratory · GST Tax Invoice · Computer generated";

  doc.rect(0, 0, 595, 8).fill(primary);

  doc.roundedRect(PAGE.left, 24, 64, 40, 4).fill(primary);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(11).text("LIS", PAGE.left + 8, 32, {
    width: 48,
    align: "center"
  });
  doc.font("Helvetica").fontSize(7).text("TAX INV", PAGE.left + 4, 46, { width: 56, align: "center" });

  if (branding.nablRegNo) {
    doc.roundedRect(PAGE.left + 72, 24, 72, 40, 4).fill(secondary);
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9).text("NABL", PAGE.left + 80, 32, {
      width: 56,
      align: "center"
    });
    doc.font("Helvetica").fontSize(6).text(branding.nablRegNo, PAGE.left + 76, 46, {
      width: 64,
      align: "center"
    });
  }

  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("ORIGINAL FOR RECIPIENT", PAGE.right - 150, 28, { width: 150, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748b")
    .text("GST Tax Invoice", PAGE.right - 150, 42, { width: 150, align: "right" });

  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(labName, PAGE.left, 76, { width: PAGE.width, align: "center" });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#334155")
    .text(address, PAGE.left, 96, { width: PAGE.width, align: "center" });
  doc.text(`GSTIN: ${labGstin}`, PAGE.left, doc.y + 2, { width: PAGE.width, align: "center" });

  doc.moveDown(0.35);
  doc
    .moveTo(PAGE.left, doc.y)
    .lineTo(PAGE.right, doc.y)
    .lineWidth(1)
    .strokeColor("#cbd5e1")
    .stroke();
  doc.moveDown(0.55);
  doc.fillColor("#0f172a").lineWidth(1);
};

const drawMetaBox = (
  doc: PDFKit.PDFDocument,
  invoice: CashierInvoice,
  orderNumber: string,
  patientPhone: string | null
): void => {
  const y = doc.y;
  const boxH = 78;
  doc.roundedRect(PAGE.left, y, PAGE.width, boxH, 4).fillAndStroke("#f8fafc", "#cbd5e1");

  const leftX = PAGE.left + 12;
  const midX = PAGE.left + 190;
  const rightX = PAGE.left + 360;
  const row1 = y + 10;
  const row2 = y + 28;
  const row3 = y + 46;
  const row4 = y + 62;

  const label = (text: string, x: number, yy: number): void => {
    doc.fillColor("#64748b").font("Helvetica").fontSize(7).text(text, x, yy);
  };
  const value = (text: string, x: number, yy: number, w = 160): void => {
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(text, x, yy, { width: w });
  };

  label("INVOICE NO.", leftX, row1);
  value(invoice.invoiceNumber, leftX, row1 + 10);
  label("ORDER NO.", midX, row1);
  value(orderNumber, midX, row1 + 10);
  label("DATE", rightX, row1);
  value(new Date(invoice.createdAt).toLocaleString("en-IN"), rightX, row1 + 10, 140);

  label("PATIENT", leftX, row3);
  value(invoice.patientName, leftX, row3 + 10, 170);
  label("PHONE", midX, row3);
  value(patientPhone?.trim() || "—", midX, row3 + 10);
  label("PATIENT GSTIN", rightX, row3);
  value(invoice.patientGstin?.trim() || "Unregistered", rightX, row3 + 10, 140);

  doc.y = y + boxH + 12;
  void row2;
  void row4;
};

const drawItemsTable = (doc: PDFKit.PDFDocument, items: OrderBillLine[]): void => {
  const col = {
    sno: PAGE.left,
    particular: PAGE.left + 28,
    hsn: PAGE.left + 300,
    qty: PAGE.left + 360,
    rate: PAGE.left + 400,
    amount: PAGE.left + 455
  };
  const widths = { sno: 28, particular: 270, hsn: 58, qty: 40, rate: 55, amount: 60 };

  const headerY = doc.y;
  doc.rect(PAGE.left, headerY, PAGE.width, 22).fill("#0b5cab");
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8);
  doc.text("#", col.sno + 6, headerY + 7);
  doc.text("Particulars / Test / Package", col.particular, headerY + 7, { width: widths.particular });
  doc.text("HSN", col.hsn, headerY + 7, { width: widths.hsn, align: "center" });
  doc.text("Qty", col.qty, headerY + 7, { width: widths.qty, align: "center" });
  doc.text("Amount", col.rate, headerY + 7, { width: widths.rate + widths.amount - 8, align: "right" });

  let y = headerY + 22;
  doc.fillColor("#0f172a").font("Helvetica").fontSize(8);

  items.forEach((item, index) => {
    const rowH = 24;
    if (y + rowH > 720) {
      doc.addPage();
      y = 48;
    }
    if (index % 2 === 1) {
      doc.rect(PAGE.left, y, PAGE.width, rowH).fill("#f1f5f9");
    }
    doc
      .moveTo(PAGE.left, y + rowH)
      .lineTo(PAGE.right, y + rowH)
      .strokeColor("#e2e8f0")
      .stroke();

    doc.fillColor("#0f172a").font("Helvetica").fontSize(8);
    doc.text(String(index + 1), col.sno + 6, y + 8);
    doc.font("Helvetica-Bold").text(item.name, col.particular, y + 5, {
      width: widths.particular - 4,
      ellipsis: true
    });
    doc
      .font("Helvetica")
      .fillColor("#64748b")
      .fontSize(7)
      .text(item.itemType === "PACKAGE" ? "Package" : "Lab test", col.particular, y + 14, {
        width: widths.particular - 4
      });
    doc.fillColor("#0f172a").fontSize(8).text("9993", col.hsn, y + 8, { width: widths.hsn, align: "center" });
    doc.text(String(item.quantity), col.qty, y + 8, { width: widths.qty, align: "center" });
    doc.font("Helvetica-Bold").text(money(item.priceMinor), col.rate, y + 8, {
      width: widths.rate + widths.amount - 8,
      align: "right"
    });
    y += rowH;
  });

  doc
    .rect(PAGE.left, headerY, PAGE.width, y - headerY)
    .strokeColor("#94a3b8")
    .lineWidth(0.8)
    .stroke();
  doc.y = y + 10;
  doc.lineWidth(1).strokeColor("#000").fillColor("#0f172a");
};

const drawTotals = (doc: PDFKit.PDFDocument, invoice: CashierInvoice): void => {
  const boxW = 230;
  const boxX = PAGE.right - boxW;
  let y = doc.y;

  if (y > 640) {
    doc.addPage();
    y = 48;
  }

  const rows: Array<{ label: string; value: string; bold?: boolean; accent?: boolean }> = [
    { label: "Subtotal", value: money(invoice.subtotalMinor) },
    {
      label: `Discount (${invoice.discountPercent.toFixed(1)}%)`,
      value: `- ${money(invoice.discountMinor)}`
    },
    { label: "Taxable value", value: money(invoice.taxableMinor) }
  ];

  if (invoice.igstMinor > 0) {
    rows.push({
      label: `IGST @ ${invoice.taxRatePercent.toFixed(1)}%`,
      value: money(invoice.igstMinor)
    });
  } else if (invoice.cgstMinor + invoice.sgstMinor > 0) {
    rows.push({
      label: `CGST @ ${(invoice.taxRatePercent / 2).toFixed(1)}%`,
      value: money(invoice.cgstMinor)
    });
    rows.push({
      label: `SGST @ ${(invoice.taxRatePercent / 2).toFixed(1)}%`,
      value: money(invoice.sgstMinor)
    });
  } else {
    rows.push({ label: "GST @ 0%", value: money(0) });
  }

  rows.push({
    label: "Net payable",
    value: money(invoice.netAmountMinor),
    bold: true,
    accent: true
  });

  const boxH = 16 + rows.length * 18 + 36;
  doc.roundedRect(boxX, y, boxW, boxH, 4).fillAndStroke("#f8fafc", "#cbd5e1");

  let rowY = y + 10;
  for (const row of rows) {
    if (row.accent) {
      doc.rect(boxX + 1, rowY - 4, boxW - 2, 22).fill("#ecfdf5");
    }
    doc
      .fillColor(row.accent ? "#047857" : "#475569")
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.bold ? 10 : 8)
      .text(row.label, boxX + 10, rowY, { width: 100 });
    doc
      .fillColor(row.accent ? "#047857" : "#0f172a")
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .text(row.value, boxX + 110, rowY, { width: boxW - 120, align: "right" });
    rowY += 18;
  }

  const paidLabel =
    invoice.dueAmountMinor <= 0
      ? "PAID IN FULL"
      : invoice.paidAmountMinor > 0
        ? "PARTIALLY PAID"
        : "UNPAID";
  doc
    .fillColor("#0f172a")
    .font("Helvetica")
    .fontSize(8)
    .text(
      `${paidLabel}  ·  Paid ${money(invoice.paidAmountMinor)}  ·  Due ${money(invoice.dueAmountMinor)}`,
      boxX + 10,
      rowY + 4,
      { width: boxW - 20 }
    );

  doc.y = Math.max(doc.y, y + boxH + 16);
};

const drawFooter = (doc: PDFKit.PDFDocument, labName: string): void => {
  const footerY = 760;
  doc
    .moveTo(PAGE.left, footerY)
    .lineTo(PAGE.right, footerY)
    .strokeColor("#cbd5e1")
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#64748b")
    .text(
      "This is a computer-generated GST tax invoice. No signature is required. HSN 9993 — Medical diagnostic services.",
      PAGE.left,
      footerY + 8,
      { width: 360 }
    );
  doc
    .font("Helvetica-Bold")
    .fillColor("#0f172a")
    .text(`For ${labName}`, PAGE.right - 150, footerY + 8, { width: 150, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#64748b")
    .text("Authorised signatory", PAGE.right - 150, footerY + 20, { width: 150, align: "right" });
};

export const taxInvoicePdf = {
  async generate(input: {
    invoice: CashierInvoice;
    orderNumber: string;
    items: OrderBillLine[];
    labName: string;
    patientPhone?: string | null;
    branding?: BrandingInput;
  }): Promise<string> {
    await fs.promises.mkdir(invoicesDir, { recursive: true });
    const filePath = path.join(invoicesDir, `${input.invoice.invoiceNumber}.pdf`);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        info: {
          Title: `Tax Invoice ${input.invoice.invoiceNumber}`,
          Author: input.labName,
          Subject: "GST Tax Invoice"
        }
      });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      doc.on("error", reject);
      stream.on("finish", () => resolve());

      drawBrandedHeader(doc, input.labName, input.branding ?? {}, input.invoice.labGstin);

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#0b5cab")
        .text("TAX INVOICE", PAGE.left, doc.y, { width: PAGE.width, align: "center" });
      doc.moveDown(0.6);

      drawMetaBox(doc, input.invoice, input.orderNumber, input.patientPhone ?? null);
      drawItemsTable(doc, input.items);
      drawTotals(doc, input.invoice);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#475569")
        .text(
          "Payment modes accepted: Cash · UPI · Card · TPA. Please retain this invoice for claims and records.",
          PAGE.left,
          doc.y,
          { width: 260 }
        );

      drawFooter(doc, input.labName);
      doc.end();
    });

    return filePath;
  }
};
