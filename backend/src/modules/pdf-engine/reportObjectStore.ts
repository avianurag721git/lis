/**
 * Private report object storage with 15-minute pre-signed download URLs.
 * Uses AWS S3 when AWS_S3_BUCKET is configured; otherwise stores encrypted
 * objects locally and issues Redis/HMAC time-limited signed URLs (same UX).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env";
import { getRedis, isRedisConfigured } from "../../common/cache/redis.client";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { logger } from "../../common/logger/logger";

const localPrivateDir = path.resolve(process.cwd(), "storage", "private-reports");

let s3: S3Client | null = null;
const getS3 = (): S3Client | null => {
  if (!env.awsS3Bucket) return null;
  if (!s3) {
    s3 = new S3Client({
      region: env.awsRegion,
      ...(env.awsAccessKeyId && env.awsSecretAccessKey
        ? {
            credentials: {
              accessKeyId: env.awsAccessKeyId,
              secretAccessKey: env.awsSecretAccessKey
            }
          }
        : {})
    });
  }
  return s3;
};

const objectKey = (tenantId: string, orderId: string): string =>
  `tenants/${tenantId}/reports/${orderId}.pdf.enc`;

export const reportObjectStore = {
  isS3Enabled(): boolean {
    return Boolean(env.awsS3Bucket);
  },

  async putEncryptedReport(tenantId: string, orderId: string, encrypted: Buffer): Promise<{ storageUri: string }> {
    const key = objectKey(tenantId, orderId);
    const client = getS3();
    if (client && env.awsS3Bucket) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.awsS3Bucket,
          Key: key,
          Body: encrypted,
          ContentType: "application/octet-stream",
          ServerSideEncryption: "AES256",
          ACL: undefined, // bucket policy: private only — never public-read
          Metadata: { tenantid: tenantId, orderid: orderId, sensitivity: "phi" }
        })
      );
      const uri = `s3://${env.awsS3Bucket}/${key}`;
      logger.info({ uri }, "Report uploaded to private S3");
      return { storageUri: uri };
    }

    await fs.promises.mkdir(localPrivateDir, { recursive: true });
    const filePath = path.join(localPrivateDir, `${tenantId}_${orderId}.pdf.enc`);
    await fs.promises.writeFile(filePath, encrypted);
    return { storageUri: `file://${filePath}` };
  },

  async getEncryptedReport(storageUri: string): Promise<Buffer> {
    if (storageUri.startsWith("s3://")) {
      const client = getS3();
      if (!client || !env.awsS3Bucket) {
        throw new AppError("S3 not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "S3_MISSING");
      }
      const without = storageUri.replace(/^s3:\/\//, "");
      const slash = without.indexOf("/");
      const bucket = without.slice(0, slash);
      const key = without.slice(slash + 1);
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) throw new AppError("Empty S3 object", HTTP_STATUS.NOT_FOUND, "REPORT_MISSING");
      return Buffer.from(bytes);
    }
    if (storageUri.startsWith("file://")) {
      return fs.promises.readFile(storageUri.replace(/^file:\/\//, ""));
    }
    // legacy local path
    return fs.promises.readFile(storageUri);
  },

  /**
   * Returns a temporary download URL (≤15 minutes).
   * S3: native pre-signed GET. Local: signed token URL served by API.
   */
  async createPresignedDownloadUrl(input: {
    tenantId: string;
    orderId: string;
    storageUri: string;
  }): Promise<{ url: string; expiresInSec: number; expiresAt: string }> {
    const expiresIn = env.reportPresignExpiresSec;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const client = getS3();

    if (input.storageUri.startsWith("s3://") && client && env.awsS3Bucket) {
      const without = input.storageUri.replace(/^s3:\/\//, "");
      const slash = without.indexOf("/");
      const bucket = without.slice(0, slash);
      const key = without.slice(slash + 1);
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: "application/pdf",
          ResponseContentDisposition: `attachment; filename="${input.orderId}.pdf"`
        }),
        { expiresIn }
      );
      return { url, expiresInSec: expiresIn, expiresAt };
    }

    const token = crypto.randomBytes(24).toString("hex");
    const payload = JSON.stringify({
      tenantId: input.tenantId,
      orderId: input.orderId,
      storageUri: input.storageUri,
      exp: Math.floor(Date.now() / 1000) + expiresIn
    });

    if (isRedisConfigured()) {
      const redis = getRedis();
      if (redis) {
        try {
          if (redis.status !== "ready") await redis.connect().catch(() => undefined);
          await redis.set(`report:sign:${token}`, payload, "EX", expiresIn);
        } catch (err) {
          logger.warn({ err }, "Redis presign store failed");
        }
      }
    } else {
      // HMAC self-contained token when Redis unavailable
      const sig = crypto.createHmac("sha256", env.reportEncryptionKey).update(payload).digest("hex");
      const embedded = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
      const url = `${env.publicApiBaseUrl.replace(/\/$/, "")}/api/reports/presigned/${embedded}`;
      return { url, expiresInSec: expiresIn, expiresAt };
    }

    const url = `${env.publicApiBaseUrl.replace(/\/$/, "")}/api/reports/presigned/${token}`;
    return { url, expiresInSec: expiresIn, expiresAt };
  },

  async resolvePresignToken(token: string): Promise<{ tenantId: string; orderId: string; storageUri: string }> {
    // Redis token
    if (isRedisConfigured()) {
      const redis = getRedis();
      if (redis) {
        try {
          if (redis.status !== "ready") await redis.connect().catch(() => undefined);
          const raw = await redis.get(`report:sign:${token}`);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              tenantId: string;
              orderId: string;
              storageUri: string;
              exp: number;
            };
            if (parsed.exp < Math.floor(Date.now() / 1000)) {
              throw new AppError("Presigned URL expired", HTTP_STATUS.UNAUTHORIZED, "PRESIGN_EXPIRED");
            }
            return parsed;
          }
        } catch (err) {
          if (err instanceof AppError) throw err;
        }
      }
    }

    // Embedded HMAC token
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
        payload: string;
        sig: string;
      };
      const expect = crypto.createHmac("sha256", env.reportEncryptionKey).update(decoded.payload).digest("hex");
      if (expect !== decoded.sig) {
        throw new AppError("Invalid presigned URL", HTTP_STATUS.UNAUTHORIZED, "PRESIGN_INVALID");
      }
      const parsed = JSON.parse(decoded.payload) as {
        tenantId: string;
        orderId: string;
        storageUri: string;
        exp: number;
      };
      if (parsed.exp < Math.floor(Date.now() / 1000)) {
        throw new AppError("Presigned URL expired", HTTP_STATUS.UNAUTHORIZED, "PRESIGN_EXPIRED");
      }
      return parsed;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("Invalid or expired presigned URL", HTTP_STATUS.UNAUTHORIZED, "PRESIGN_INVALID");
    }
  }
};
