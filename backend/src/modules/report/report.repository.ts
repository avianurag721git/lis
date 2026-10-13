import { randomUUID } from "crypto";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ReportRecord } from "./report.types";

const reports = new Map<string, ReportRecord>();

export const reportRepository = {
  create(tenantId: string, patientId: string, patientName: string): ReportRecord {
    const now = new Date().toISOString();
    const report: ReportRecord = {
      id: randomUUID(),
      tenantId,
      patientId,
      patientName,
      status: "PENDING",
      reportUrl: null,
      filePath: null,
      generatedAt: null,
      createdAt: now,
      updatedAt: now
    };
    reports.set(report.id, report);
    return report;
  },
  markReady(tenantId: string, reportId: string, reportUrl: string, filePath: string): ReportRecord {
    const report = this.getById(tenantId, reportId);
    report.status = "READY";
    report.reportUrl = reportUrl;
    report.filePath = filePath;
    report.generatedAt = new Date().toISOString();
    report.updatedAt = new Date().toISOString();
    reports.set(report.id, report);
    return report;
  },
  getById(tenantId: string, reportId: string): ReportRecord {
    const report = reports.get(reportId);
    if (!report || report.tenantId !== tenantId) {
      throw new AppError("Report not found", HTTP_STATUS.NOT_FOUND, "REPORT_NOT_FOUND");
    }
    return report;
  }
};
