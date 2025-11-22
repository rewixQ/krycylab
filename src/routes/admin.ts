import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireMfa, requireRole } from "../middleware/authGuards";
import {
  createUser,
  listRoles,
  listUsers,
  setUserActiveState,
  updateUserRole
} from "../services/userService";
import { addFlash } from "../lib/flash";
import { prisma } from "../lib/prisma";
import { RoleName } from "../lib/roles";
import { parseCreateUser } from "../validators/user";

const router = Router();
const adminGuards = [requireAuth, requireMfa, requireRole("admin")];

router.get("/", adminGuards, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, cats, assignments] = await Promise.all([
      (prisma as any).users.count({ where: { is_active: true } }),
      (prisma as any).cats.count(),
      (prisma as any).caretakerassignments.count()
    ]);
    res.render("admin/overview", {
      title: "Admin Dashboard",
      metrics: { users, cats, assignments }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users", adminGuards, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, roles] = await Promise.all([listUsers(), listRoles()]);
    res.render("admin/users", { title: "User Management", users, roles });
  } catch (error) {
    next(error);
  }
});

router.post("/users", adminGuards, async (req: Request, res: Response) => {
  try {
    const form = parseCreateUser(req.body);
    await createUser(
      {
        username: form.username,
        email: form.email,
        roleId: form.roleId,
        password: form.password
      },
      req.user!.id
    );
    addFlash(req, "success", "User created.");
    res.redirect("/admin/users");
  } catch (error) {
    addFlash(
      req,
      "error",
      error instanceof Error ? error.message : "Failed to create user."
    );
    res.redirect("/admin/users");
  }
});

router.post("/users/:id/role", adminGuards, async (req: Request, res: Response) => {
  try {
    await updateUserRole(
      Number(req.params.id),
      Number(req.body.roleId),
      { id: req.user!.id, roleName: req.user!.roleName as RoleName }
    );
    addFlash(req, "success", "Role updated.");
    res.redirect("/admin/users");
  } catch (error) {
    addFlash(
      req,
      "error",
      error instanceof Error ? error.message : "Unable to update role."
    );
    res.redirect("/admin/users");
  }
});

router.post("/users/:id/state", adminGuards, async (req: Request, res: Response) => {
  try {
    const active = req.body.state === "activate";
    await setUserActiveState(Number(req.params.id), active, {
      id: req.user!.id,
      roleName: req.user!.roleName as RoleName
    });
    addFlash(req, "success", active ? "User activated." : "User deactivated.");
    res.redirect("/admin/users");
  } catch (error) {
    addFlash(
      req,
      "error",
      error instanceof Error ? error.message : "Unable to change state."
    );
    res.redirect("/admin/users");
  }
});

router.get(
  "/logs",
  [requireAuth, requireMfa, requireRole("superadmin")],
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await (prisma as any).auditlogs.findMany({
        orderBy: { timestamp: "desc" },
        take: 100,
        include: { users: { select: { username: true } } }
      });
      res.render("admin/logs", { title: "Audit Logs", logs });
    } catch (error) {
      next(error);
    }
  }
);

export { router };

