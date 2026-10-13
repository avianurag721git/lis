import { httpClient } from "../../services/http";
import type { SampleDto } from "../orders/orders.service";

type ApiOk<T> = { success: true; data: T };

export const samplesApi = {
  async list(status?: string): Promise<SampleDto[]> {
    const { data } = await httpClient.get<ApiOk<{ samples: SampleDto[] }>>("/samples", {
      params: status ? { status } : {}
    });
    return data.data.samples;
  },

  async collect(input: { sampleId?: string; barcode?: string }): Promise<SampleDto> {
    const { data } = await httpClient.post<ApiOk<{ sample: SampleDto }>>("/samples/collect", input);
    return data.data.sample;
  },

  async transit(input: { sampleId?: string; barcode?: string; temperatureCelsius: number }): Promise<SampleDto> {
    const { data } = await httpClient.post<ApiOk<{ sample: SampleDto }>>("/samples/transit", input);
    return data.data.sample;
  },

  async receive(input: { barcode: string; accept?: boolean; rejectionReason?: string | null }): Promise<SampleDto> {
    const { data } = await httpClient.post<ApiOk<{ sample: SampleDto }>>("/samples/receive", input);
    return data.data.sample;
  },

  async rapidScan(input: { barcode: string }): Promise<{
    sample: SampleDto;
    action: "COLLECTED" | "RECEIVED_AND_PROCESSING" | "ALREADY_IN_LAB";
    pipeline: import("../orders/orders.service").OrderPipelineStatus;
    labResultsActivated: number;
  }> {
    const { data } = await httpClient.post<
      ApiOk<{
        sample: SampleDto;
        action: "COLLECTED" | "RECEIVED_AND_PROCESSING" | "ALREADY_IN_LAB";
        pipeline: import("../orders/orders.service").OrderPipelineStatus;
        labResultsActivated: number;
      }>
    >("/samples/rapid-scan", input);
    return data.data;
  }
};
