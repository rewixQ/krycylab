import speakeasy from "speakeasy";
import { prisma } from "../lib/prisma";
import { logAudit } from "./auditService";

export const generateMfaSecret = (username: string) => {
  return speakeasy.generateSecret({
    length: 32,
    name: `Cat Management (${username})`
  });
};

export const activateMfa = async (
  userId: number,
  base32Secret: string,
  code: string
) => {
  const verified = speakeasy.totp.verify({
    secret: base32Secret,
    encoding: "base32",
    token: code,
    window: 1
  });

  if (!verified) {
    throw new Error("Invalid verification code.");
  }

  await prisma.$transaction([
    prisma.mFAToken.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false }
    }),
    prisma.mFAToken.create({
      data: {
        userId,
        tokenType: "totp",
        tokenValue: base32Secret
      }
    })
  ]);

  await logAudit({
    userId,
    operation: "MFA_ENABLE",
    tableName: "MFATokens",
    eventType: "auth.mfa.enable"
  });
};

export const disableMfa = async (userId: number) => {
  await prisma.mFAToken.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false }
  });

  await logAudit({
    userId,
    operation: "MFA_DISABLE",
    tableName: "MFATokens",
    eventType: "auth.mfa.disable"
  });
};

export const verifyMfaCode = async (userId: number, code: string) => {
  const secret = await prisma.mFAToken.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: "desc" }
  });

  if (!secret) {
    throw new Error("MFA is not configured.");
  }

  const verified = speakeasy.totp.verify({
    secret: secret.tokenValue,
    encoding: "base32",
    token: code,
    window: 1
  });

  if (verified) {
    await prisma.mFAToken.update({
      where: { id: secret.id },
      data: { lastUsedAt: new Date() }
    });
  }

  return verified;
};

