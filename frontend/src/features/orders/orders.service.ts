import { httpClient } from "../../services/http";
import type { Patient } from "../../modules/patients/patients.service";

export type CollectionType = "WALK_IN" | "HOME_COLLECTION" | "B2B_FRANCHISEE";

export type CatalogTest = {
  id: string;
  departmentId: string;
  name: string;
  code: string | null;
  priceMinor: number;
  sampleType: string;
  tubeColor: string;
};

export type CatalogPackage = {
  id: string;
  name: string;
  code: string | null;
  priceMinor: number;
};

export type OrderItemInput = {
  itemType: "TEST" | "PACKAGE";
  testId?: string;
  packageId?: string;
  quantity?: number;
};

export type SampleDto = {
  id: string;
  orderId: string;
  patientId: string;
  barcode: string;
  sampleType: string;
  tubeColor: string;
  status: string;
  collectedAt: string | null;
  collectedByUserId: string | null;
  temperatureLog: Array<{ at: string; celsius: number; recordedByUserId: string }>;
  receivedAt: string | null;
  receivedByUserId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BarcodeStickerPayload = {
  barcode: string;
  format: "CODE128";
  sampleType: string;
  tubeColor: string;
  patientName: string;
  patientUhid: string | null;
  orderNumber: string;
  labelSize: "2x1";
  widthInches: 2;
  heightInches: 1;
};

export type OrderBookingDto = {
  id: string;
  orderNumber: string;
  patientId: string;
  collectionType: CollectionType;
  franchiseeId: string | null;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  netAmountMinor: number;
  status: string;
  createdByUserId: string;
  createdAt: string;
};

export type OrderPipelineStep = {
  id: string;
  label: string;
  complete: boolean;
  current: boolean;
  at: string | null;
};

export type OrderPipelineStatus = {
  orderId: string;
  orderNumber: string;
  patientName: string;
  steps: OrderPipelineStep[];
  percentComplete: number;
};

type ApiOk<T> = { success: true; data: T };

export const ordersApi = {
  async catalog(): Promise<{ tests: CatalogTest[]; packages: CatalogPackage[] }> {
    const { data } = await httpClient.get<ApiOk<{ tests: CatalogTest[]; packages: CatalogPackage[] }>>("/orders/catalog");
    return data.data;
  },

  async book(payload: {
    patientId?: string;
    patient?: Partial<Patient> & { mobile?: string; uhid?: string };
    collectionType: CollectionType;
    franchiseeId?: string | null;
    referredDoctor?: string | null;
    referralDoctorId?: string | null;
    discountMinor?: number;
    taxRatePercent?: number;
    items: OrderItemInput[];
  }): Promise<{
    order: OrderBookingDto;
    items: Array<{ id: string; name: string; priceMinor: number; quantity: number; itemType: string }>;
    samples: SampleDto[];
    patient: Patient | null;
    barcodeStickerPayloads: BarcodeStickerPayload[];
  }> {
    const { data } = await httpClient.post<
      ApiOk<{
        order: OrderBookingDto;
        items: Array<{ id: string; name: string; priceMinor: number; quantity: number; itemType: string }>;
        samples: SampleDto[];
        patient: Patient | null;
        barcodeStickerPayloads: BarcodeStickerPayload[];
      }>
    >("/orders/book", payload);
    return data.data;
  },

  async pipeline(orderId: string): Promise<OrderPipelineStatus> {
    const { data } = await httpClient.get<ApiOk<{ pipeline: OrderPipelineStatus }>>(`/orders/${orderId}/pipeline`);
    return data.data.pipeline;
  },

  async homeCollection(): Promise<
    Array<{
      order: OrderBookingDto;
      patientName: string;
      patientPhone: string | null;
      collectionAddress: string | null;
      samples: SampleDto[];
    }>
  > {
    const { data } = await httpClient.get<
      ApiOk<{
        orders: Array<{
          order: OrderBookingDto;
          patientName: string;
          patientPhone: string | null;
          collectionAddress: string | null;
          samples: SampleDto[];
        }>;
      }>
    >("/orders/home-collection");
    return data.data.orders;
  }
};
