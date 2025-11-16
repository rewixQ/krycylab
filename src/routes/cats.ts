import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireMfa, requireRole } from "../middleware/authGuards";
import {
  assignCaretaker,
  createCat,
  getCat,
  listCats,
  updateCat
} from "../services/catService";
import { addFlash } from "../lib/flash";
import { prisma } from "../lib/prisma";
import { parseCatPayload } from "../validators/cat";

const router = Router();
const adminOnly = [requireAuth, requireMfa, requireRole("admin")];
const caretakers = [requireAuth, requireMfa];

router.get("/", caretakers, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cats = await listCats(req.query.search as string | undefined);
    res.render("cats/index", { title: "Cats", cats, query: req.query });
  } catch (error) {
    next(error);
  }
});

router.get("/new", adminOnly, (_req: Request, res: Response) => {
  res.render("cats/form", { title: "Add Cat", cat: null });
});

router.post("/", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = parseCatPayload(req.body);
    await createCat(
      {
        name: payload.name,
        breed: payload.breed || null,
        friends: payload.friends || null,
        birthDate: payload.birthDate ? new Date(payload.birthDate) : null
      },
      req.user!.id
    );
    addFlash(req, "success", "Cat created.");
    res.redirect("/cats");
  } catch (error) {
    next(error);
  }
});

router.get("/:id", caretakers, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const catId = Number(req.params.id);
    if (Number.isNaN(catId)) {
      addFlash(req, "error", "Invalid cat id.");
      return res.redirect("/cats");
    }
    const cat = await getCat(catId);
    if (!cat) {
      return res.status(404).render("404", { title: "Cat not found" });
    }
    let caretakersOptions: Array<{ id: number; username: string }> = [];
    if (["admin", "superadmin"].includes(req.user!.roleName)) {
      caretakersOptions = await prisma.user.findMany({
        where: {
          isDeleted: false,
          role: { is: { roleName: "caretaker" } }
        },
        select: { id: true, username: true }
      });
    }
    res.render("cats/detail", {
      title: cat.name,
      cat,
      caretakers: caretakersOptions
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/edit", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const catId = Number(req.params.id);
    if (Number.isNaN(catId)) {
      addFlash(req, "error", "Invalid cat id.");
      return res.redirect("/cats");
    }
    const cat = await getCat(catId);
    if (!cat) return res.status(404).render("404", { title: "Cat not found" });
    res.render("cats/form", { title: `Edit ${cat.name}`, cat });
  } catch (error) {
    next(error);
  }
});

router.post("/:id", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const catId = Number(req.params.id);
    if (Number.isNaN(catId)) {
      addFlash(req, "error", "Invalid cat id.");
      return res.redirect("/cats");
    }
    const payload = parseCatPayload(req.body);
    await updateCat(
      catId,
      {
        name: payload.name,
        breed: payload.breed || null,
        friends: payload.friends || null,
        birthDate: payload.birthDate ? new Date(payload.birthDate) : null
      },
      req.user!.id
    );
    addFlash(req, "success", "Cat updated.");
    res.redirect(`/cats/${req.params.id}`);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/assign", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const catId = Number(req.params.id);
    if (Number.isNaN(catId)) {
      addFlash(req, "error", "Invalid cat id.");
      return res.redirect("/cats");
    }
    const caretakersList = await prisma.user.findMany({
      where: {
        isDeleted: false,
        role: { is: { roleName: "caretaker" } }
      },
      select: { id: true }
    });

    const caretakerIds = caretakersList.map((c) => c.id);
    const targetId = Number(req.body.userId);

    if (!caretakerIds.includes(targetId)) {
      addFlash(req, "error", "Invalid caretaker selected.");
      return res.redirect(`/cats/${req.params.id}`);
    }

    await assignCaretaker(catId, targetId, req.user!.id);
    addFlash(req, "success", "Caretaker assigned.");
    res.redirect(`/cats/${req.params.id}`);
  } catch (error) {
    next(error);
  }
});

export { router };

