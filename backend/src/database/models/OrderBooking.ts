import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type IOrderBooking = Document & {
  tenantId: string;
  orderNumber: string;
  patientId: string;
  status: string;
  totalAmountMinor: number;
};

const orderBookingSchema = new Schema<IOrderBooking>(
  {
    orderNumber: { type: String, required: true },
    patientId: { type: String, required: true },
    status: { type: String, default: "PENDING" },
    totalAmountMinor: { type: Number, default: 0 }
  },
  { timestamps: true }
);

orderBookingSchema.plugin(tenantScopePlugin);
orderBookingSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });

export const OrderBookingModel =
  mongoose.models.OrderBooking ?? mongoose.model<IOrderBooking>("OrderBooking", orderBookingSchema);
