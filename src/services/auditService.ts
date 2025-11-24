import { prisma } from "../lib/prisma";

type AuditInput = {
  user_id?: number;
  operation: string;
  table_name?: string;
  record_id?: number;
  event_type?: string;
  success?: boolean;
  error_message?: string;
  changes?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

export const logAudit = async ({
  user_id,
  operation,
  table_name,
  record_id,
  event_type,
  success = true,
  error_message,
  changes,
  extra
}: AuditInput) => {
  // Map table_name to enum if it's a string
  const tableEnum = table_name === 'Users' ? 'Users' : 
                    table_name === 'Roles' ? 'Roles' : 
                    table_name === 'Cats' ? 'Cats' : 
                    // Add more mappings as needed, default to unknown
                    'Users' as const;

  const auditData = {
    user_id,
    operation,
    table_name: tableEnum,
    record_id,
    success_flag: success,
    error_message,
    ip_address: extra?.ip_address || null,
    user_agent: extra?.user_agent || null,
    changes: changes || extra ? JSON.stringify({ ...changes, ...extra, event_type }) : undefined
  };

  await prisma.auditlogs.create({
    data: auditData as any
  });
};

