import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { requireAuth, requireMfa, requireRole } from "../middleware/authGuards";
import {
  assignCaretaker,
  createCat,
  getCat,
  listCats,
  updateCat,
  deleteCat
} from "../services/catService";
import { addFlash } from "../lib/flash";
import { prisma } from "../lib/prisma";
import { parseCatPayload } from "../validators/cat";

const router = Router();

const uploadDir = path.join(process.cwd(), "public", "uploads", "cats");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

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

router.post("/", adminOnly, upload.single("photo"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = parseCatPayload(req.body);
    const photoPath = req.file ? path.posix.join("uploads", "cats", req.file.filename) : null;
    await createCat(
      {
        name: payload.name,
        breed: payload.breed || null,
        friends: payload.friends || null,
        birthDate: payload.birthDate ? new Date(payload.birthDate) : null,
        photoPath
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
      const caretakers = await (prisma as any).users.findMany({
        where: { roles: { role_name: "caretaker" } },
        select: { user_id: true, username: true }
      });
      caretakersOptions = caretakers.map((u: any) => ({
        id: u.user_id,
        username: u.username
      }));
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

router.post("/:id", adminOnly, upload.single("photo"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const catId = Number(req.params.id);
    if (Number.isNaN(catId)) {
      addFlash(req, "error", "Invalid cat id.");
      return res.redirect("/cats");
    }
    const payload = parseCatPayload(req.body);
    const photoPath = req.file ? path.posix.join("uploads", "cats", req.file.filename) : undefined;
    await updateCat(
      catId,
      {
        name: payload.name,
        breed: payload.breed || null,
        friends: payload.friends || null,
        birthDate: payload.birthDate ? new Date(payload.birthDate) : null,
        ...(photoPath !== undefined ? { photoPath } : {})
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
    const caretakersList = await (prisma as any).users.findMany({
      where: { roles: { role_name: "caretaker" } },
      select: { user_id: true }
    });

    const caretakerIds = caretakersList.map((c: any) => c.user_id);
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

router.post("/:id/delete", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const catId = Number(req.params.id);
    if (Number.isNaN(catId)) {
      addFlash(req, "error", "Invalid cat id.");
      return res.redirect("/cats");
    }

    const ok = await deleteCat(catId, req.user!.id);
    if (!ok) {
      addFlash(req, "error", "Cat not found.");
      return res.redirect("/cats");
    }

    addFlash(req, "success", "Cat deleted.");
    res.redirect("/cats");
  } catch (error) {
    next(error);
  }
});

export { router };

