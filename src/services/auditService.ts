import { prisma } from "../lib/prisma";

type AuditInput = {
  userId?: number;
  operation: string;
  tableName?: string;
  rowId?: number;
  eventType?: string;
  success?: boolean;
  errorMessage?: string;
  changes?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

export const logAudit = async ({
  userId,
  operation,
  tableName,
  rowId,
  eventType,
  success = true,
  errorMessage,
  changes,
  extra
}: AuditInput) => {
  await prisma.auditLog.create({
    data: {
      userId,
      operation,
      tableName,
      rowId,
      eventType,
      success,
      errorMessage,
      changes: changes ? JSON.stringify(changes) : undefined,
      extra: extra ? JSON.stringify(extra) : undefined
    }
  });
};

