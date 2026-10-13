import { invoiceRepository } from "../infrastructure/invoice.repository";
import { toInvoiceDto, toMinorUnits, InvoiceResponseDto } from "../domain/payment.dto";

export const invoiceService = {
  async createInvoice(tenantId: string, patientId: string, totalAmount: number): Promise<{ invoice: InvoiceResponseDto }> {
    const totalAmountMinor = toMinorUnits(totalAmount);
    const invoice = await invoiceRepository.insert({ tenantId, patientId, totalAmountMinor });
    return { invoice: toInvoiceDto(invoice) };
  },

  async getInvoiceById(tenantId: string, invoiceId: string): Promise<{ invoice: InvoiceResponseDto }> {
    const invoice = await invoiceRepository.findById(tenantId, invoiceId);
    return { invoice: toInvoiceDto(invoice) };
  }
};
