import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logAudit } from "./auditService";
import { hasRequiredRole, RoleName } from "../lib/roles";
import { validatePasswordStrength } from "./passwordService";

export const listUsers = () => {
  return (prisma as any).users.findMany({
    where: { is_active: true },
    include: {
      roles: true
    },
    orderBy: { created_at: "desc" }
  });
};

export const getUserById = (id: number) => {
  return (prisma as any).users.findUnique({
    where: { user_id: id },
    include: { roles: true }
  });
};

export const listRoles = () => (prisma as any).roles.findMany();

export const createUser = async (
  data: {
    username: string;
    email: string;
    roleId: number;
    password: string;
  },
  actorId: number
) => {
  const strengthError = validatePasswordStrength(data.password);
  if (strengthError) {
    throw new Error(strengthError);
  }

  // Enforce single active admin at application level
  const role = await (prisma as any).roles.findUnique({
    where: { role_id: data.roleId }
  });
  if (role?.role_name === "admin") {
    const activeAdmins = await (prisma as any).users.count({
      where: { is_active: true, roles: { role_name: "admin" } }
    });
    if (activeAdmins > 0) {
      throw new Error("Only one active admin is allowed.");
    }
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await (prisma as any).users.create({
    data: {
      username: data.username,
      email: data.email,
      password_hash: passwordHash,
      role_id: data.roleId
    }
  });

  await logAudit({
    user_id: actorId,
    operation: "CREATE",
    table_name: "Users",
    record_id: user.user_id,
    event_type: "users.create"
  });

  return user;
};

export const updateUserRole = async (
  targetId: number,
  roleId: number,
  actor: { id: number; roleName: RoleName }
) => {
  await ensureRoleChangeAllowed(actor.roleName, targetId);

  // Enforce single active admin when changing role
  const desiredRole = await (prisma as any).roles.findUnique({
    where: { role_id: roleId }
  });
  if (desiredRole?.role_name === "admin") {
    const activeAdmins = await (prisma as any).users.count({
      where: {
        is_active: true,
        roles: { role_name: "admin" },
        NOT: { user_id: targetId }
      }
    });
    if (activeAdmins > 0) {
      throw new Error("Only one active admin is allowed.");
    }
  }

  const updated = await (prisma as any).users.update({
    where: { user_id: targetId },
    data: { role_id: roleId }
  });

  await logAudit({
    user_id: actor.id,
    operation: "UPDATE",
    table_name: "Users",
    record_id: targetId,
    event_type: "users.role.update",
    changes: { role_id: roleId }
  });

  return updated;
};

export const setUserActiveState = async (
  targetId: number,
  active: boolean,
  actor: { id: number; roleName: RoleName }
) => {
  await ensureRoleChangeAllowed(actor.roleName, targetId);

  // If activating an admin, ensure no other active admin exists
  if (active) {
    const target = await (prisma as any).users.findUnique({
      where: { user_id: targetId },
      include: { roles: true }
    });
    if (target?.roles?.role_name === "admin") {
      const activeAdmins = await (prisma as any).users.count({
        where: {
          is_active: true,
          roles: { role_name: "admin" },
          NOT: { user_id: targetId }
        }
      });
      if (activeAdmins > 0) {
        throw new Error("Only one active admin is allowed.");
      }
    }
  }

  const updated = await (prisma as any).users.update({
    where: { user_id: targetId },
    data: { is_active: active }
  });

  await logAudit({
    user_id: actor.id,
    operation: active ? "ENABLE" : "DISABLE",
    table_name: "Users",
    record_id: targetId,
    event_type: active ? "users.enable" : "users.disable"
  });

  return updated;
};

const ensureRoleChangeAllowed = async (
  actorRole: RoleName,
  targetUserId: number
) => {
  const target = await (prisma as any).users.findUnique({
    where: { user_id: targetUserId },
    include: { roles: true }
  });
  if (!target) throw new Error("User not found");

  const targetRole = (target.roles?.role_name ?? "caretaker") as RoleName;
  if (!hasRequiredRole(actorRole, targetRole) || actorRole === targetRole) {
    throw new Error("Insufficient privileges for this action.");
  }
};

