import { prisma } from "../lib/prisma";
import { logAudit } from "./auditService";

type CatListItem = {
	id: number;
	name: string;
	breed?: string | null;
	updatedAt: Date | null;
	photoPath?: string | null;
	caretaker?: { id: number; username: string } | null;
};

type CatDetail = CatListItem & {
	birthDate?: Date | null;
	friends?: string | null;
	assignments: Array<{
		user: { username: string };
		assignedAt: Date | null;
	}>;
};

export const listCats = async (search?: string): Promise<CatListItem[]> => {
	const cats = await (prisma as any).cats.findMany({
		where: search
			? {
					OR: [
						{ name: { contains: search } },
						{ breed: { contains: search } }
					]
				}
			: undefined,
		include: {
			caretakerassignments: {
				where: { unassigned_at: null },
				include: { users: { select: { user_id: true, username: true } } },
				take: 1
			}
		},
		orderBy: { updated_at: "desc" }
	});

	return cats.map((c: any) => ({
		id: c.cat_id,
		name: c.name,
		breed: c.breed,
		updatedAt: c.updated_at ?? null,
		photoPath: c.filename ?? null,
		caretaker: c.caretakerassignments?.[0]?.users
			? {
					id: c.caretakerassignments[0].users.user_id,
					username: c.caretakerassignments[0].users.username
				}
			: null
	}));
};

export const getCat = async (id: number): Promise<CatDetail | null> => {
	const cat = await (prisma as any).cats.findUnique({
		where: { cat_id: id },
		include: {
			caretakerassignments: {
				include: { users: { select: { username: true } } },
				orderBy: { assigned_at: "desc" }
			}
		}
	});
	if (!cat) return null;

	const active = cat.caretakerassignments?.find((a: any) => a.unassigned_at == null);

	return {
		id: cat.cat_id,
		name: cat.name,
		breed: cat.breed,
		birthDate: cat.birth_date ?? null,
		friends: cat.description ?? null,
		updatedAt: cat.updated_at ?? null,
		photoPath: cat.filename ?? null,
		caretaker: active?.users ? { id: active.users.user_id, username: active.users.username } : null,
		assignments: (cat.caretakerassignments ?? []).map((a: any) => ({
			user: { username: a.users?.username ?? "" },
			assignedAt: a.assigned_at ?? null
		}))
	};
};

export const createCat = async (
	data: {
		name: string;
		breed?: string | null;
		friends?: string | null;
		birthDate?: Date | null;
		photoPath?: string | null;
	},
	actorId: number
) => {
	const created = await (prisma as any).cats.create({
		data: {
			name: data.name,
			breed: data.breed ?? null,
			description: data.friends ?? null,
			birth_date: data.birthDate ?? null,
			filename: data.photoPath ?? null
		}
	});

	await logAudit({
		user_id: actorId,
		operation: "CREATE",
		table_name: "Cats",
		record_id: created.cat_id,
		event_type: "cats.create",
		changes: {
			name: data.name,
			breed: data.breed ?? null,
			description: data.friends ?? null,
			birth_date: data.birthDate ?? null
		}
	});

	return created;
};

export const updateCat = async (
	id: number,
	data: {
		name?: string;
		breed?: string | null;
		friends?: string | null;
		birthDate?: Date | null;
		photoPath?: string | null;
	},
	actorId: number
) => {
	const updated = await (prisma as any).cats.update({
		where: { cat_id: id },
		data: {
			...(data.name !== undefined ? { name: data.name } : {}),
			...(data.breed !== undefined ? { breed: data.breed } : {}),
			...(data.friends !== undefined ? { description: data.friends } : {}),
			...(data.birthDate !== undefined ? { birth_date: data.birthDate } : {}),
			...(data.photoPath !== undefined ? { filename: data.photoPath } : {})
		}
	});

	await logAudit({
		user_id: actorId,
		operation: "UPDATE",
		table_name: "Cats",
		record_id: id,
		event_type: "cats.update",
		changes: data as Record<string, unknown>
	});

	return updated;
};

export const assignCaretaker = async (
	catId: number,
	userId: number,
	actorId: number
) => {
	await (prisma as any).$transaction([
		(prisma as any).caretakerassignments.updateMany({
			where: { cat_id: catId, unassigned_at: null },
			data: { unassigned_at: new Date() }
		}),
		(prisma as any).caretakerassignments.create({
			data: { cat_id: catId, user_id: userId, assigned_at: new Date() }
		})
	]);

	await logAudit({
		user_id: actorId,
		operation: "ASSIGN",
		table_name: "CaretakerAssignments",
		record_id: catId,
		event_type: "cats.assign",
		extra: { catId, userId }
	});
};

