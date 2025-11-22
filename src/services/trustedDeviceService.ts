import crypto from "crypto";
import { prisma } from "../lib/prisma";

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const isTrustedDevice = async (userId: number, token?: string) => {
  if (!token) return false;
  const fingerprint = hashToken(token);
  const device = await (prisma as any).trusteddevices.findFirst({
    where: {
      user_id: userId,
      device_fingerprint: Buffer.from(fingerprint, "utf-8"),
      is_trusted: true,
      revoked_at: null,
      trust_expires_at: { gt: new Date() }
    }
  });
  return Boolean(device);
};

export const rememberDevice = async (
  userId: number,
  token: string,
  deviceName?: string
) => {
  const fingerprint = hashToken(token);
  await (prisma as any).trusteddevices.upsert({
    where: {
      user_id_device_fingerprint: {
        user_id: userId,
        device_fingerprint: Buffer.from(fingerprint, "utf-8")
      }
    },
    update: { is_trusted: true, device_name: deviceName, revoked_at: null, last_seen: new Date() },
    create: {
      user_id: userId,
      device_fingerprint: Buffer.from(fingerprint, "utf-8"),
      device_name: deviceName,
      is_trusted: true
    }
  });
};

export const revokeDevice = async (userId: number, fingerprintToken: string) => {
  const fingerprint = hashToken(fingerprintToken);
  await (prisma as any).trusteddevices.updateMany({
    where: { user_id: userId, device_fingerprint: Buffer.from(fingerprint, "utf-8") },
    data: { is_trusted: false, revoked_at: new Date() }
  });
};

export const disableDeviceById = async (userId: number, deviceId: number) => {
  await (prisma as any).trusteddevices.updateMany({
    where: { user_id: userId, device_id: deviceId },
    data: { is_trusted: false, revoked_at: new Date() }
  });
};

