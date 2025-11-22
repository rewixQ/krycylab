import bcrypt from "bcryptjs";
import dayjs from "dayjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { passwordNeedsReset } from "./passwordService";
import { logAudit } from "./auditService";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MINUTES = 15;
const LOCK_DURATION_MINUTES = 15;

type RoleRelation = { role_name: string };
type MfaTokenRelation = unknown;
type UserWithRelations = {
	user_id: number;
	username: string;
	password_hash: string;
	is_active: boolean | null;
	account_locked_until: Date | null;
	last_password_change: Date | null;
	password_expires_at: Date | null;
	roles: RoleRelation | null;
	mfatokens: MfaTokenRelation[];
};

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
	const user = await (prisma as any).users.findUnique({
		where: { username },
		include: {
			roles: true,
			mfatokens: { where: { is_active: true } }
		}
	});

  if (!user || !user.is_active) {
    await recordLoginAttempt({
      username,
      ip_address: meta.ip,
      success: false
    });
    return { success: false, message: "Invalid credentials." };
  }

  if (
    user.account_locked_until &&
    user.account_locked_until.getTime() > Date.now()
  ) {
    return { success: false, message: "Account is temporarily locked." };
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  await recordLoginAttempt({
    username: user.username,
    ip_address: meta.ip,
    success: passwordMatches
  });

  if (!passwordMatches) {
    await evaluateLock(user.user_id, user.username);
    return { success: false, message: "Invalid credentials." };
  }

  const needsReset = passwordNeedsReset({ 
    last_password_change: user.last_password_change || null, 
    password_expires_at: user.password_expires_at || null 
  });
	const hasMfa = user.mfatokens.length > 0;

  await logAudit({
    user_id: user.user_id,
    operation: "LOGIN",
    table_name: "Users",
    record_id: user.user_id,
    extra: { 
      ip_address: meta.ip, 
      user_agent: meta.userAgent,
      event_type: "auth.login"
    }
  });

  return {
    success: true,
    user,
    needsPasswordReset: needsReset,
    hasMfa
  };
};

export const recordLoginAttempt = async ({
  username,
  ip_address,
  success
}: {
  username: string;
  ip_address: string;
  success: boolean;
}) => {
	await (prisma as any).loginattempts.create({
    data: {
      username,
      ip_address,
      success
    }
  });
};

export const evaluateLock = async (user_id: number, username: string) => {
  const windowStart = dayjs().subtract(LOCK_WINDOW_MINUTES, "minute").toDate();
	const failedAttempts = await (prisma as any).loginattempts.count({
    where: {
      username,
      success: false,
      attempted_at: { gte: windowStart }
    }
  });

  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
		await (prisma as any).users.update({
      where: { user_id },
      data: {
        account_locked_until: dayjs()
          .add(LOCK_DURATION_MINUTES, "minute")
          .toDate()
      }
    });
  }
};

export const createUserSession = async (
  user_id: number,
  token: string,
  meta: RequestMeta
) => {
	await (prisma as any).usersessions.upsert({
    where: { session_token_hash: token },
    update: {
      user_id,
      ip_address: meta.ip,
      device_fingerprint: meta.deviceFingerprint
        ? Buffer.from(meta.deviceFingerprint, "utf-8")
        : undefined,
      tls_version: meta.tlsVersion,
      tls_cipher_suite: meta.cipherSuite,
      certificate_fingerprint: meta.certificateSignature,
      last_activity: new Date()
    },
    create: {
      user_id,
      session_token_hash: token,
      ip_address: meta.ip,
      device_fingerprint: meta.deviceFingerprint
        ? Buffer.from(meta.deviceFingerprint, "utf-8")
        : undefined,
      tls_version: meta.tlsVersion,
      tls_cipher_suite: meta.cipherSuite,
      certificate_fingerprint: meta.certificateSignature,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days example
    }
  });
};

export const touchSession = async (token: string) => {
	await (prisma as any).usersessions.updateMany({
    where: { session_token_hash: token },
    data: { last_activity: new Date() }
  });
};

export const deactivateSession = async (token: string) => {
	await (prisma as any).usersessions.updateMany({
    where: { session_token_hash: token },
    data: { expires_at: new Date() }
  });
};

