import bcrypt from "bcryptjs";
import dayjs from "dayjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { passwordNeedsReset } from "./passwordService";
import { logAudit } from "./auditService";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MINUTES = 15;
const LOCK_DURATION_MINUTES = 15;

type UserWithRelations = Prisma.UserGetPayload<{
  include: { role: true; mfaTokens: { where: { isActive: true } } };
}>;

export type CredentialResult =
  | {
      success: true;
      user: UserWithRelations;
      needsPasswordReset: boolean;
      hasMfa: boolean;
    }
  | { success: false; message: string };

export type RequestMeta = {
  ip: string;
  userAgent?: string;
  tlsVersion?: string;
  cipherSuite?: string;
  certificateSignature?: string;
  deviceFingerprint?: string;
};

export const verifyCredentials = async (
  username: string,
  password: string,
  meta: RequestMeta
): Promise<CredentialResult> => {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      role: true,
      mfaTokens: { where: { isActive: true } }
    }
  });

  if (!user || user.isDeleted) {
    await recordLoginAttempt({
      username,
      ipAddress: meta.ip,
      success: false
    });
    return { success: false, message: "Invalid credentials." };
  }

  if (!user.isActive) {
    return { success: false, message: "Account is disabled." };
  }

  if (
    user.accountLockedUntil &&
    user.accountLockedUntil.getTime() > Date.now()
  ) {
    return { success: false, message: "Account is temporarily locked." };
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  await recordLoginAttempt({
    userId: user.id,
    username: user.username,
    ipAddress: meta.ip,
    success: passwordMatches
  });

  if (!passwordMatches) {
    await evaluateLock(user.id);
    return { success: false, message: "Invalid credentials." };
  }

  const needsReset = passwordNeedsReset(user);
  const hasMfa = user.mfaTokens.length > 0;

  await logAudit({
    userId: user.id,
    operation: "LOGIN",
    tableName: "Users",
    rowId: user.id,
    eventType: "auth.login",
    extra: { ip: meta.ip, userAgent: meta.userAgent }
  });

  return {
    success: true,
    user,
    needsPasswordReset: needsReset,
    hasMfa
  };
};

export const recordLoginAttempt = async ({
  userId,
  username,
  ipAddress,
  success
}: {
  userId?: number;
  username?: string;
  ipAddress: string;
  success: boolean;
}) => {
  await prisma.loginAttempt.create({
    data: {
      userId,
      username,
      ipAddress,
      success
    }
  });
};

export const evaluateLock = async (userId: number) => {
  const windowStart = dayjs().subtract(LOCK_WINDOW_MINUTES, "minute").toDate();
  const failedAttempts = await prisma.loginAttempt.count({
    where: {
      userId,
      success: false,
      attemptedAt: { gte: windowStart }
    }
  });

  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        accountLockedUntil: dayjs()
          .add(LOCK_DURATION_MINUTES, "minute")
          .toDate()
      }
    });
  }
};

export const createUserSession = async (
  userId: number,
  token: string,
  meta: RequestMeta
) => {
  await prisma.userSession.create({
    data: {
      userId,
      token,
      ipAddress: meta.ip,
      deviceFingerprint: meta.deviceFingerprint,
      tlsVersion: meta.tlsVersion,
      cipherSuite: meta.cipherSuite,
      certificateSignature: meta.certificateSignature
    }
  });
};

export const touchSession = async (token: string) => {
  await prisma.userSession.updateMany({
    where: { token },
    data: { lastActiveAt: new Date() }
  });
};

export const deactivateSession = async (token: string) => {
  await prisma.userSession.updateMany({
    where: { token },
    data: { isActive: false }
  });
};

