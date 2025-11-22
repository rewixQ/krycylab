import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { requireAuth, requireMfa } from "../middleware/authGuards";
import { prisma } from "../lib/prisma";
import { addFlash } from "../lib/flash";
import {
  passwordRules,
  updatePassword,
  validatePasswordStrength
} from "../services/passwordService";
import { disableMfa } from "../services/mfaService";
import { disableDeviceById } from "../services/trustedDeviceService";

const guards = [requireAuth, requireMfa];
export const router = Router();

router.get("/", guards, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dbUser = await (prisma as any).users.findUnique({
      where: { user_id: req.user!.id },
      select: {
        username: true,
        email: true,
        last_password_change: true
      }
    });
    const user = dbUser
      ? {
          username: dbUser.username,
          email: dbUser.email,
          passwordChangedAt: dbUser.last_password_change
        }
      : null;
    res.render("account/profile", { title: "My Account", user });
  } catch (error) {
    next(error);
  }
});

router.post("/", guards, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    await (prisma as any).users.update({
      where: { user_id: req.user!.id },
      data: { email }
    });
    addFlash(req, "success", "Profile updated.");
    res.redirect("/account");
  } catch (error) {
    next(error);
  }
});

router.get("/password", guards, (_req: Request, res: Response) => {
  res.render("account/password", {
    title: "Change Password",
    rules: passwordRules
  });
});

router.post("/password", guards, async (req: Request, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) {
    addFlash(req, "error", "Passwords do not match.");
    return res.redirect("/account/password");
  }

  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) {
    addFlash(req, "error", strengthError);
    return res.redirect("/account/password");
  }

  const user = await (prisma as any).users.findUnique({
    where: { user_id: req.user!.id },
    select: { password_hash: true }
  });
  if (!user) {
    addFlash(req, "error", "User not found.");
    return res.redirect("/login");
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    addFlash(req, "error", "Current password is incorrect.");
    return res.redirect("/account/password");
  }

  try {
    await updatePassword(req.user!.id, newPassword);
    req.session.pendingPasswordReset = false;
    addFlash(req, "success", "Password updated.");
    res.redirect("/account");
  } catch (error) {
    addFlash(
      req,
      "error",
      error instanceof Error ? error.message : "Unable to update password."
    );
    res.redirect("/account/password");
  }
});

router.get("/security", guards, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [mfaToken, devicesRaw] = await Promise.all([
      (prisma as any).mfatokens.findFirst({
        where: { user_id: req.user!.id, is_active: true }
      }),
      (prisma as any).trusteddevices.findMany({
        where: { user_id: req.user!.id, is_trusted: true, revoked_at: null },
        orderBy: { first_seen: "desc" },
        select: {
          device_id: true,
          device_name: true,
          first_seen: true
        }
      })
    ]);

    const devices = (devicesRaw as any[]).map((d) => ({
      id: d.device_id,
      deviceName: d.device_name,
      registeredAt: d.first_seen
    }));

    res.render("account/security", {
      title: "Security",
      hasMfa: Boolean(mfaToken),
      devices
    });
  } catch (error) {
    next(error);
  }
});

router.post("/security/mfa/disable", guards, async (req: Request, res: Response) => {
  try {
    await disableMfa(req.user!.id);
    req.session.mustSetupMfa = true;
    addFlash(req, "info", "MFA disabled. Please set up a new factor.");
    res.redirect("/mfa/setup");
  } catch (error) {
    addFlash(req, "error", "Failed to disable MFA.");
    res.redirect("/account/security");
  }
});

router.post("/security/devices/:id/revoke", guards, async (req: Request, res: Response) => {
  try {
    const deviceId = Number(req.params.id);
    if (Number.isNaN(deviceId)) {
      addFlash(req, "error", "Invalid device id.");
      return res.redirect("/account/security");
    }
    await disableDeviceById(req.user!.id, deviceId);
    addFlash(req, "success", "Device revoked.");
    res.redirect("/account/security");
  } catch (error) {
    addFlash(req, "error", "Unable to revoke device.");
    res.redirect("/account/security");
  }
});

