import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { tenantService } from "../tenant/tenant.service";
import { auditService } from "../audit/audit.service";
import { whatsappService } from "../notification/whatsapp.service";
import { reportRepository } from "./report.repository";
import { TestResult } from "./report.types";
import { ParameterEvaluation, PatientGender, ReportTemplateType } from "./reportTemplates.types";
import { reportTemplatesService } from "./reportTemplates.service";
import { reportTemplatesRepository } from "./reportTemplates.repository";

type GenerateReportInput = {
  tenantId: string;
  userId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  pathologistName: string;
  templateType?: ReportTemplateType;
  patientGender?: PatientGender;
  patientAgeYears?: number;
  // Preferred (new) mode: parameter-based values + server computed normal ranges.
  parameterResults?: Array<{ parameterId: string; value: string }>;
  // Backward-compatible mode: client provides referenceRange as a string.
  testResults?: TestResult[];
};

const reportsDir = path.resolve(process.cwd(), "storage", "reports");

const ensureReportsDir = async (): Promise<void> => {
  await fs.promises.mkdir(reportsDir, { recursive: true });
};

export const reportService = {
  async generate(input: GenerateReportInput): Promise<{ reportId: string; reportUrl: string }> {
    await ensureReportsDir();
    const report = reportRepository.create(input.tenantId, input.patientId, input.patientName);
    const tenantConfig = await tenantService.resolveTenantConfiguration(input.tenantId);
    const fileName = `${report.id}.pdf`;
    const filePath = path.join(reportsDir, fileName);

    let evaluated: ParameterEvaluation[] | null = null;
    let autoBoldAbnormal = false;
    let showReferenceByParameterId: Record<string, boolean> = {};
    let groupByTest = false;
    if (input.parameterResults?.length && input.patientGender != null && input.patientAgeYears != null) {
      const templateType = input.templateType ?? tenantConfig.reportTemplate;
      const template = await reportTemplatesRepository.getActiveTemplateWithItems(input.tenantId, templateType);
      showReferenceByParameterId = Object.fromEntries(template.items.map((i) => [i.parameterId, i.showReferenceRange]));
      evaluated = await reportTemplatesService.evaluateParametersForPatient({
        tenantId: input.tenantId,
        templateType,
        patientGender: input.patientGender,
        patientAgeYears: input.patientAgeYears,
        parameterValues: input.parameterResults
      });
      autoBoldAbnormal = template.autoBoldAbnormal;
      groupByTest = template.groupByTest;
    }

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);
      doc.fontSize(20).text(tenantConfig.brandingName, { align: "center" });
      doc.moveDown();
      doc.fontSize(14).text(`Patient: ${input.patientName}`);
      doc.text(`Patient ID: ${input.patientId}`);
      doc.text(`Pathologist: ${input.pathologistName}`);
      doc.text(`Generated At: ${new Date().toLocaleString()}`);
      doc.moveDown();
      doc.fontSize(16).text("Test Results");
      doc.moveDown(0.5);

      if (evaluated?.length) {
        if (groupByTest) {
          let lastGroup = "";
          for (const ev of evaluated) {
            const group = `${ev.departmentName ?? ""}::${ev.testName ?? ""}`;
            if (group && group !== lastGroup) {
              lastGroup = group;
              doc.moveDown(0.5);
              doc.font("Helvetica-Bold").fontSize(13).text(`${ev.departmentName ?? ""} - ${ev.testName ?? ""}`.trim());
              doc.font("Helvetica").fontSize(12);
            }

            doc.fontSize(12);
            if (autoBoldAbnormal && ev.abnormal) {
              doc.font("Helvetica-Bold");
            } else {
              doc.font("Helvetica");
            }
            const unitPart = ev.unit ? ` ${ev.unit}` : "";
            const showRef = showReferenceByParameterId[ev.parameterId] ?? true;
            const refPart = showRef && ev.referenceRange ? ` (Ref: ${ev.referenceRange})` : "";
            doc.text(`${ev.parameterName ?? ev.parameterId}: ${ev.value}${unitPart}${refPart}`);
          }

          doc.font("Helvetica");
        } else {
        evaluated.forEach((ev) => {
          // Bold abnormal values if enabled by the active template.
          doc.fontSize(12);
          if (autoBoldAbnormal && ev.abnormal) {
            doc.font("Helvetica-Bold");
          } else {
            doc.font("Helvetica");
          }
          const unitPart = ev.unit ? ` ${ev.unit}` : "";
          const showRef = showReferenceByParameterId[ev.parameterId] ?? true;
          const refPart = showRef && ev.referenceRange ? ` (Ref: ${ev.referenceRange})` : "";
          doc.text(`${ev.parameterName ?? ev.parameterId}: ${ev.value}${unitPart}${refPart}`);
        });

        // Reset font for footer/other text.
        doc.font("Helvetica");
        }
      } else {
        const fallback = input.testResults ?? [];
        if (fallback.length === 0) {
          throw new AppError("No testResults provided", HTTP_STATUS.BAD_REQUEST, "REPORT_TESTS_REQUIRED");
        }
        fallback.forEach((result) => {
          doc.fontSize(12).text(`${result.testName}: ${result.value} (Ref: ${result.referenceRange})`);
        });
      }

      doc.moveDown();
      doc.text(`Digital Signature: ${input.pathologistName}`);
      doc.end();

      stream.on("finish", () => resolve());
      stream.on("error", reject);
    });

    const reportUrl = `/reports/${report.id}/download`;
    reportRepository.markReady(input.tenantId, report.id, reportUrl, filePath);

    auditService.log({
      userId: input.userId,
      tenantId: input.tenantId,
      action: "REPORT_GENERATED",
      entity: "Report",
      entityId: report.id,
      metadata: { patientId: input.patientId, patientName: input.patientName }
    });

    await whatsappService.sendReportReadyMessage({
      to: `whatsapp:${input.patientPhone}`,
      patientName: input.patientName,
      reportUrl
    });

    return { reportId: report.id, reportUrl };
  },

  getDownloadFile(tenantId: string, reportId: string): { filePath: string; fileName: string } {
    const report = reportRepository.getById(tenantId, reportId);
    if (!report.filePath || report.status !== "READY") {
      throw new AppError("Report is not ready", HTTP_STATUS.BAD_REQUEST, "REPORT_NOT_READY");
    }
    return { filePath: report.filePath, fileName: `${report.id}.pdf` };
  },

  getStatus(tenantId: string, reportId: string): { status: "PENDING" | "READY"; reportUrl: string | null } {
    const report = reportRepository.getById(tenantId, reportId);
    return { status: report.status, reportUrl: report.reportUrl };
  }
};
