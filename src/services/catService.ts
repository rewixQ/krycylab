import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logAudit } from "./auditService";

export const listCats = async (search?: string) => {
  return prisma.cat.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { breed: { contains: search } }
          ]
        }
      : undefined,
    include: {
      caretaker: { select: { id: true, username: true } }
    },
    orderBy: { updatedAt: "desc" }
  });
};

export const getCat = async (id: number) => {
  return prisma.cat.findUnique({
    where: { id },
    include: {
      caretaker: { select: { id: true, username: true } },
      assignments: {
        include: { user: { select: { username: true } } },
        orderBy: { assignedAt: "desc" }
      }
    }
  });
};

export const createCat = async (
  data: Prisma.CatCreateInput,
  actorId: number
) => {
  const cat = await prisma.cat.create({ data });
  await logAudit({
    userId: actorId,
    operation: "CREATE",
    tableName: "Cats",
    rowId: cat.id,
    eventType: "cats.create",
    changes: data as Record<string, unknown>
  });
  return cat;
};

export const updateCat = async (
  id: number,
  data: Prisma.CatUpdateInput,
  actorId: number
) => {
  const cat = await prisma.cat.update({
    where: { id },
    data
  });
  await logAudit({
    userId: actorId,
    operation: "UPDATE",
    tableName: "Cats",
    rowId: id,
    eventType: "cats.update",
    changes: data as Record<string, unknown>
  });
  return cat;
};

export const assignCaretaker = async (
  catId: number,
  userId: number,
  actorId: number
) => {
  await prisma.$transaction([
    prisma.cat.update({
      where: { id: catId },
      data: { caretakerId: userId }
    }),
    prisma.caretakerAssignment.upsert({
      where: {
        userId_catId: {
          userId,
          catId
        }
      },
      update: { unassignedAt: null },
      create: { catId, userId }
    })
  ]);

  await logAudit({
    userId: actorId,
    operation: "ASSIGN",
    tableName: "CaretakerAssignments",
    rowId: catId,
    eventType: "cats.assign",
    extra: { catId, userId }
  });
};

