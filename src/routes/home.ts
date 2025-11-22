import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      return res.render("home", { title: "Cat Management" });
    }

    const [recentCatsRaw, totalAssignments] = await Promise.all([
      (prisma as any).cats.findMany({
        orderBy: { updated_at: "desc" },
        take: 5,
        select: { cat_id: true, name: true, updated_at: true }
      }),
      (prisma as any).caretakerassignments.count({
        where: { user_id: req.user!.id, unassigned_at: null }
      })
    ]);

    const recentCats = (recentCatsRaw as any[]).map((c) => ({
      id: c.cat_id,
      name: c.name,
      updatedAt: c.updated_at
    }));

    res.render("home", {
      title: "Dashboard",
      recentCats,
      totalAssignments
    });
  } catch (error) {
    next(error);
  }
});

