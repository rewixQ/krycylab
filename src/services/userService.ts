import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logAudit } from "./auditService";
import { hasRequiredRole, RoleName } from "../lib/roles";
import { validatePasswordStrength } from "./passwordService";

export const listUsers = () => {
  return prisma.user.findMany({
    where: { isDeleted: false },
    include: {
      role: true
    },
    orderBy: { createdAt: "desc" }
  });
};

export const getUserById = (id: number) => {
  return prisma.user.findUnique({
    where: { id },
    include: { role: true }
  });
};

export const listRoles = () => prisma.role.findMany();

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

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      password: passwordHash,
      roleId: data.roleId
    }
  });

  await logAudit({
    userId: actorId,
    operation: "CREATE",
    tableName: "Users",
    rowId: user.id,
    eventType: "users.create"
  });

  return user;
};

export const updateUserRole = async (
  targetId: number,
  roleId: number,
  actor: { id: number; roleName: RoleName }
) => {
  await ensureRoleChangeAllowed(actor.roleName, targetId);
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { roleId }
  });

  await logAudit({
    userId: actor.id,
    operation: "UPDATE",
    tableName: "Users",
    rowId: targetId,
    eventType: "users.role.update",
    changes: { roleId }
  });

  return updated;
};

export const setUserActiveState = async (
  targetId: number,
  active: boolean,
  actor: { id: number; roleName: RoleName }
) => {
  await ensureRoleChangeAllowed(actor.roleName, targetId);
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { isActive: active }
  });

  await logAudit({
    userId: actor.id,
    operation: active ? "ENABLE" : "DISABLE",
    tableName: "Users",
    rowId: targetId,
    eventType: active ? "users.enable" : "users.disable"
  });

  return updated;
};

const ensureRoleChangeAllowed = async (
  actorRole: RoleName,
  targetUserId: number
) => {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { role: true }
  });
  if (!target) throw new Error("User not found");

  const targetRole = (target.role?.roleName ?? "caretaker") as RoleName;
  if (!hasRequiredRole(actorRole, targetRole) || actorRole === targetRole) {
    throw new Error("Insufficient privileges for this action.");
  }
};

