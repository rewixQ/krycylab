import speakeasy from "speakeasy";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { logAudit } from "./auditService";

const maskSecret = (s: string) => {
  if (!s) return "<empty>";
  if (s.length <= 6) return `${s[0]}***${s[s.length - 1]}`;
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
};

const DEBUG_MFA = process.env.DEBUG_MFA === "1";

const toHexPreview = (buf: Buffer, max = 16) => {
  const hex = Array.from(buf.slice(0, max))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex}${buf.length > max ? "…" : ""} (len=${buf.length})`;
};

const bufferFromUnknown = (val: unknown): Buffer => {
  if (Buffer.isBuffer(val)) return val as Buffer;
  if (val instanceof Uint8Array) return Buffer.from(val);
  if (val instanceof ArrayBuffer) return Buffer.from(new Uint8Array(val as ArrayBuffer));
  if (typeof val === "string") {
    const s = val.trim();
    if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length % 4 === 0) {
      try {
        const b = Buffer.from(s, "base64");
        if (b.length > 0) return b;
      } catch {}
    }
    return Buffer.from(s, "utf8");
  }
  return Buffer.from(String(val), "utf8");
};

const getMfaKey = (): Buffer | null => {
  const raw = process.env.MFA_SECRET_KEY;
  if (!raw) return null;
  try {
    if (/^[0-9a-fA-F]+$/.test(raw) && (raw.length === 32 || raw.length === 64)) {
      const buf = Buffer.from(raw, "hex");
      if (buf.length === 16) {
        return Buffer.concat([buf, buf]);
      }
      if (buf.length === 32) return buf;
    }
    try {
      const b64 = Buffer.from(raw, "base64");
      if (b64.length === 32) return b64;
    } catch {}
    const utf = Buffer.from(raw, "utf8");
    if (utf.length >= 32) return utf.subarray(0, 32);
    const padded = Buffer.alloc(32);
    utf.copy(padded);
    return padded;
  } catch {
    return null;
  }
};

const encryptSecretAesCbc = (plain: string, key: Buffer) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  return { ciphertext: encrypted, iv };
};

const decryptSecretAesCbc = (ciphertext: Buffer, iv: Buffer, key: Buffer) => {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
};

export const generateMfaSecret = (username: string) => {
  return speakeasy.generateSecret({
    length: 32,
    name: `Cat Management (${username})`,
    issuer: "Cat Management"
  });
};

export const activateMfa = async (
  userId: number,
  base32Secret: string,
  code: string
) => {
  console.log("[MFA] activateMfa called", {
    userId,
    codeLength: code?.length ?? 0,
    secretProvided: !!base32Secret
  });
  const normalizedSecret = base32Secret.replace(/\s+/g, "").toUpperCase();
  console.log("[MFA] activateMfa normalized", {
    secretMasked: maskSecret(normalizedSecret),
    length: normalizedSecret.length
  });
  const numericCode = (code ?? "").trim();
  const isCodeValidShape = /^\d{6}$/.test(numericCode);
  // strict manual verify to avoid library permissiveness/mismatch
  const step = 30;
  const digits = 6;
  const window = 1; // keep tight during activation
  const now = Math.floor(Date.now() / 1000);
  const candidates = [];
  for (let d = -window; d <= window; d++) {
    const t = speakeasy.totp({
      secret: normalizedSecret,
      encoding: "base32",
      digits,
      step,
      time: now + d * step
    });
    candidates.push(t);
  }
  const verified = isCodeValidShape && candidates.includes(numericCode);

  if (DEBUG_MFA) {
    const epoch = Math.floor(Date.now() / 1000);
    const step = 30;
    const counter = Math.floor(epoch / step);
    const tokens = [-1, 0, 1].map((d) =>
      speakeasy.totp({
        secret: normalizedSecret,
        encoding: "base32",
        digits: 6,
        step,
        time: (counter + d) * step
      })
    );
    console.log("[MFA][DEBUG] activateMfa tokens", { counter, tokens });
  }

  if (!verified) {
    console.warn("[MFA] activateMfa verification failed");
    throw new Error("Invalid verification code.");
  }

  const key = getMfaKey();
  let tokenValue: Buffer;
  let tokenIv: Buffer | undefined;
  if (key) {
    const { ciphertext, iv } = encryptSecretAesCbc(normalizedSecret, key);
    tokenValue = ciphertext;
    tokenIv = iv;
    console.log("[MFA] activateMfa storing encrypted secret", {
      cipherHex: toHexPreview(ciphertext),
      ivHex: toHexPreview(iv)
    });
  } else {
    tokenValue = Buffer.from(normalizedSecret, "utf-8");
    console.log("[MFA] activateMfa storing plaintext secret (no MFA_SECRET_KEY set)");
  }

  await (prisma as any).$transaction([
    (prisma as any).mfatokens.updateMany({
      where: { user_id: userId, is_active: true },
      data: { is_active: false, revoked_at: new Date() }
    }),
    (prisma as any).mfatokens.create({
      data: {
        user_id: userId,
        token_type: "TOTP",
        token_value: tokenValue,
        token_iv: tokenIv,
        is_active: true
      }
    })
  ]);

  console.log("[MFA] activateMfa success");

  // Read back from DB to verify no mutation by triggers/extensions
  try {
    const saved = await (prisma as any).mfatokens.findFirst({
      where: { user_id: userId, is_active: true },
      orderBy: { created_at: "desc" }
    });
    if (saved) {
      const raw = bufferFromUnknown(saved.token_value);
      const savedStr = raw.toString("utf-8");
      const savedNorm = savedStr.replace(/\s+/g, "").toUpperCase();
      console.log("[MFA] activateMfa post-save readback", {
        tokenId: saved.token_id,
        rawHex: toHexPreview(raw),
        savedMasked: maskSecret(savedNorm),
        savedLen: savedNorm.length,
        matchesInput: savedNorm === normalizedSecret
      });
      if (DEBUG_MFA) {
        const epoch = Math.floor(Date.now() / 1000);
        const step = 30;
        const counter = Math.floor(epoch / step);
        const tokens = [-1, 0, 1].map((d) =>
          speakeasy.totp({
            secret: savedNorm,
            encoding: "base32",
            digits: 6,
            step,
            time: (counter + d) * step
          })
        );
        console.log("[MFA][DEBUG] activateMfa readback tokens", {
          counter,
          tokens
        });
      }
    }
  } catch (e) {
    console.warn("[MFA] activateMfa readback failed", e);
  }

  await logAudit({
    user_id: userId,
    operation: "MFA_ENABLE",
    table_name: "MFATokens",
    event_type: "auth.mfa.enable"
  });
};

export const disableMfa = async (userId: number) => {
  await (prisma as any).mfatokens.updateMany({
    where: { user_id: userId, is_active: true },
    data: { is_active: false, revoked_at: new Date() }
  });

  await logAudit({
    user_id: userId,
    operation: "MFA_DISABLE",
    table_name: "MFATokens",
    event_type: "auth.mfa.disable"
  });
};

export const verifyMfaCode = async (userId: number, code: string) => {
  console.log("[MFA] verifyMfaCode called", {
    userId,
    codeLength: code?.length ?? 0
  });
  const secret = await (prisma as any).mfatokens.findFirst({
    where: { user_id: userId, is_active: true },
    orderBy: { created_at: "desc" }
  });

  if (!secret) {
    console.warn("[MFA] verifyMfaCode no active secret");
    throw new Error("MFA is not configured.");
  }

  let normalizedSecret: string;
  try {
    const key = getMfaKey();
    if (key && secret.token_iv) {
      const ciphertext = bufferFromUnknown(secret.token_value);
      const iv = bufferFromUnknown(secret.token_iv);
      const decrypted = decryptSecretAesCbc(ciphertext, iv, key);
      normalizedSecret = decrypted.replace(/\s+/g, "").toUpperCase();
      console.log("[MFA] verifyMfaCode decrypted secret", {
        tokenId: secret.token_id,
        ivHex: toHexPreview(iv),
        cipherHex: toHexPreview(ciphertext),
        secretMasked: maskSecret(normalizedSecret)
      });
    } else {
      const stored = bufferFromUnknown(secret.token_value).toString("utf-8");
      normalizedSecret = stored.replace(/\s+/g, "").toUpperCase();
      console.log("[MFA] verifyMfaCode plaintext secret mode", {
        tokenId: secret.token_id,
        secretMasked: maskSecret(normalizedSecret),
        rawHex: toHexPreview(bufferFromUnknown(secret.token_value))
      });
    }
  } catch (e) {
    console.error("[MFA] verifyMfaCode decrypt failure", e);
    throw new Error("Failed to verify code.");
  }

  // Enforce numeric 6-digit code and manual verify with tight window
  const numericCode = (code ?? "").trim();
  const isCodeValidShape = /^\d{6}$/.test(numericCode);
  const step = 30;
  const digits = 6;
  const window = 2; // login verification slightly more tolerant
  const now = Math.floor(Date.now() / 1000);
  const candidates = [];
  for (let d = -window; d <= window; d++) {
    const t = speakeasy.totp({
      secret: normalizedSecret,
      encoding: "base32",
      digits,
      step,
      time: now + d * step
    });
    candidates.push(t);
  }
  const verified = isCodeValidShape && candidates.includes(numericCode);

  if (DEBUG_MFA) {
    const epoch = Math.floor(Date.now() / 1000);
    const step = 30;
    const counter = Math.floor(epoch / step);
    const tokens = [-1, 0, 1].map((d) =>
      speakeasy.totp({
        secret: normalizedSecret,
        encoding: "base32",
        digits: 6,
        step,
        time: (counter + d) * step
      })
    );
    console.log("[MFA][DEBUG] verifyMfaCode tokens", { counter, tokens, provided: code });
  }

  if (verified) {
    await (prisma as any).mfatokens.update({
      where: { token_id: secret.token_id },
      data: { last_used_at: new Date() }
    });
    console.log("[MFA] verifyMfaCode success");
  } else {
    console.warn("[MFA] verifyMfaCode failed");

    // Attempt to record failed attempt and print detailed diagnostics
    try {
      const before = await (prisma as any).mfatokens.findUnique({
        where: { token_id: secret.token_id }
      });

      await (prisma as any).mfatokens.update({
        where: { token_id: secret.token_id },
        data: { failed_attempts: { increment: 1 } }
      });

      const after = await (prisma as any).mfatokens.findUnique({
        where: { token_id: secret.token_id }
      });

      const epoch = Math.floor(Date.now() / 1000);
      const step = 30;
      const counter = Math.floor(epoch / step);
      const tokenWindows = [-2, -1, 0, 1, 2].map((d) => ({
        windowOffset: d,
        token: speakeasy.totp({
          secret: normalizedSecret,
          encoding: "base32",
          digits: 6,
          step,
          time: (counter + d) * step
        })
      }));

      console.log("[MFA][FAIL] verify details", {
        userId,
        tokenId: secret.token_id,
        codeLength: code?.length ?? 0,
        providedCode: code,
        params: { window: 3, digits: 6, step: 30, algorithm: "sha1" },
        serverTimeIso: new Date().toISOString(),
        epoch,
        counter,
        tokenWindows,
        failedAttemptsBefore: before?.failed_attempts ?? null,
        failedAttemptsAfter: after?.failed_attempts ?? null,
        mfaLockedUntil: after?.mfa_locked_until ?? null,
        lastUsedAt: after?.last_used_at ?? null,
        createdAt: after?.created_at ?? null
      });

      if (DEBUG_MFA) {
        const recentAudit = await (prisma as any).auditlogs.findMany({
          where: {
            table_name: "MFATokens",
            record_id: secret.token_id
          },
          orderBy: { timestamp: "desc" },
          take: 20
        });
        console.log("[MFA][DEBUG] recent audit logs for token", {
          tokenId: secret.token_id,
          entries: recentAudit?.map((e: any) => ({
            log_id: e.log_id,
            timestamp: e.timestamp,
            operation: e.operation,
            severity: e.severity,
            changes: e.changes,
            error_message: e.error_message
          }))
        });
      }
    } catch (err) {
      console.warn("[MFA] failed-attempt diagnostics error", err);
    }
  }

  return verified;
};

