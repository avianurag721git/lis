export type CollectionType = "WALK_IN" | "HOME_COLLECTION" | "B2B_FRANCHISEE";

export type OrderItemInput = {
  itemType: "TEST" | "PACKAGE";
  testId?: string;
  packageId?: string;
  quantity?: number;
};

export type BookOrderInput = {
  patientId?: string;
  patient?: {
    name?: string;
    mobile?: string;
    phone?: string;
    uhid?: string;
    gender?: "MALE" | "FEMALE" | "OTHER" | null;
    dateOfBirth?: string | null;
    ageValue?: number | null;
    ageUnit?: "DAYS" | "MONTHS" | "YEARS" | null;
    ageYears?: number | null;
  };
  collectionType: CollectionType;
  franchiseeId?: string | null;
  referredDoctor?: string | null;
  referralDoctorId?: string | null;
  discountMinor?: number;
  taxRatePercent?: number;
  items: OrderItemInput[];
};

export type OrderBooking = {
  id: string;
  orderNumber: string;
  patientId: string;
  collectionType: CollectionType;
  franchiseeId: string | null;
  referredDoctor: string | null;
  paymentStatus: string;
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  netAmountMinor: number;
  status: string;
  createdByUserId: string;
  createdAt: string;
};

export type OrderItem = {
  id: string;
  itemType: "TEST" | "PACKAGE";
  testId: string | null;
  packageId: string | null;
  name: string;
  priceMinor: number;
  quantity: number;
};

export type SampleStatus =
  | "PENDING_COLLECTION"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "RECEIVED_IN_LAB"
  | "REJECTED";

export type TemperatureLogEntry = {
  at: string;
  celsius: number;
  recordedByUserId: string;
};

export type Sample = {
  id: string;
  orderId: string;
  patientId: string;
  barcode: string;
  sampleType: string;
  tubeColor: string;
  status: SampleStatus;
  collectedAt: string | null;
  collectedByUserId: string | null;
  temperatureLog: TemperatureLogEntry[];
  receivedAt: string | null;
  receivedByUserId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 2"×1" thermal label payload for Code128 printing at billing/booking time. */
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

export type OrderPipelineStep = {
  id: "BOOKED" | "COLLECTED" | "IN_LAB" | "PROCESSING" | "VERIFIED" | "DISPATCHED";
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
