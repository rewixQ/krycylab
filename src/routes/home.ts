import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated()) {
      return res.render("home", { title: "Cat Management" });
    }

    const [recentCats, totalAssignments] = await Promise.all([
      prisma.cat.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5
      }),
      prisma.caretakerAssignment.count({
        where: { userId: req.user!.id }
      })
    ]);

    res.render("home", {
      title: "Dashboard",
      recentCats,
      totalAssignments
    });
  } catch (error) {
    next(error);
  }
});

