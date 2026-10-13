import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type WalletTransaction = {
  type: string;
  amountMinor: number;
  balanceAfterMinor: number;
  gatewayRef?: string | null;
  note?: string | null;
};

export type IFranchiseeWallet = Document & {
  tenantId: string;
  franchiseeCode: string;
  name: string;
  balanceMinor: number;
  creditLimitMinor: number;
  transactions: WalletTransaction[];
};

const franchiseeWalletSchema = new Schema<IFranchiseeWallet>(
  {
    franchiseeCode: { type: String, required: true },
    name: { type: String, required: true },
    balanceMinor: { type: Number, default: 0 },
    creditLimitMinor: { type: Number, default: 0 },
    transactions: {
      type: [
        {
          type: { type: String, required: true },
          amountMinor: { type: Number, required: true },
          balanceAfterMinor: { type: Number, required: true },
          gatewayRef: { type: String, default: null },
          note: { type: String, default: null }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

franchiseeWalletSchema.plugin(tenantScopePlugin);
franchiseeWalletSchema.index({ tenantId: 1, franchiseeCode: 1 }, { unique: true });

export const FranchiseeWalletModel =
  mongoose.models.FranchiseeWallet ?? mongoose.model<IFranchiseeWallet>("FranchiseeWallet", franchiseeWalletSchema);
