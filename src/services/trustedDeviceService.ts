import crypto from "crypto";
import { prisma } from "../lib/prisma";

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const isTrustedDevice = async (userId: number, token?: string) => {
  if (!token) return false;
  const fingerprint = hashToken(token);
  const device = await prisma.trustedDevice.findFirst({
    where: {
      userId,
      deviceFingerprint: fingerprint,
      isActive: true
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
  await prisma.trustedDevice.upsert({
    where: {
      userId_deviceFingerprint: {
        userId,
        deviceFingerprint: fingerprint
      }
    },
    update: { isActive: true, deviceName },
    create: {
      userId,
      deviceFingerprint: fingerprint,
      deviceName,
      isActive: true
    }
  });
};

export const revokeDevice = async (userId: number, fingerprintToken: string) => {
  const fingerprint = hashToken(fingerprintToken);
  await prisma.trustedDevice.updateMany({
    where: { userId, deviceFingerprint: fingerprint },
    data: { isActive: false }
  });
};

export const disableDeviceById = async (userId: number, deviceId: number) => {
  await prisma.trustedDevice.updateMany({
    where: { userId, id: deviceId },
    data: { isActive: false }
  });
};

