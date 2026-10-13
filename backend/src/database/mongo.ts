import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../common/logger/logger";

let connected = false;

export const connectMongo = async (): Promise<boolean> => {
  if (!env.mongodbUri) {
    logger.info("MONGODB_URI not set — tenant document models use PostgreSQL only");
    return false;
  }
  if (connected) {
    return true;
  }
  try {
    await mongoose.connect(env.mongodbUri);
    connected = true;
    logger.info("MongoDB connected for tenant-scoped document models");
    return true;
  } catch (err) {
    logger.warn({ err }, "MongoDB connection failed — falling back to PostgreSQL");
    return false;
  }
};

export const isMongoConnected = (): boolean => connected && mongoose.connection.readyState === 1;
