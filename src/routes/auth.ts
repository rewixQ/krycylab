import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import passport from "passport";
import { v4 as uuid } from "uuid";
import { addFlash } from "../lib/flash";
import {
  createUserSession,
  deactivateSession
} from "../services/authService";
import {
  isTrustedDevice,
  rememberDevice
} from "../services/trustedDeviceService";
import {
  activateMfa,
  generateMfaSecret,
  verifyMfaCode
} from "../services/mfaService";
import { isDev } from "../config/env";
import { requireAuth } from "../middleware/authGuards";

export const router = Router();

router.get("/login", (req: Request, res: Response) => {
  if (req.isAuthenticated() && req.session.mfaVerified) {
    return res.redirect("/cats");
  }
  res.render("auth/login", { title: "Sign in" });
});

router.post("/login", (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    "local",
    (
      err: Error | null,
      user: Express.User | false,
      info?: { message?: string }
    ) => {
    if (err) return next(err);
    if (!user) {
      addFlash(req, "error", info?.message ?? "Invalid credentials.");
      return res.redirect("/login");
    }
    req.login(user, async (loginErr) => {
      if (loginErr) return next(loginErr);
      try {
        const trustedToken = req.cookies?.trusted_device;
        const isTrusted = await isTrustedDevice(user.id, trustedToken);
        const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
        const userAgent = req.get("user-agent") ?? undefined;
        if (isTrusted) {
          req.session.mfaVerified = true;
          req.session.requiresMfa = false;
        }

        if (req.session.mustSetupMfa) {
          req.session.mfaVerified = true;
          await createUserSession(user.id, req.sessionID, {
            ip: clientIp,
            userAgent,
            deviceFingerprint: trustedToken
          });
          addFlash(req, "info", "Setup MFA to complete onboarding.");
          return res.redirect("/mfa/setup");
        }

        if (!req.session.mfaVerified) {
          req.session.requiresMfa = true;
          addFlash(req, "info", "Complete MFA verification to finish sign-in.");
          return res.redirect("/mfa/verify");
        }

        await createUserSession(user.id, req.sessionID, {
          ip: clientIp,
          userAgent,
          deviceFingerprint: trustedToken
        });

        if (req.session.pendingPasswordReset) {
          addFlash(req, "info", "Change your password to continue.");
          return res.redirect("/account/password");
        }

        addFlash(req, "success", "Welcome back!");
        return res.redirect("/cats");
      } catch (error) {
        return next(error);
      }
    });
    }
  )(req, res, next);
});

router.post("/logout", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.sessionID) {
      await deactivateSession(req.sessionID);
    }
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("trusted_device");
        res.redirect("/login");
      });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/mfa/setup", requireAuth, (req: Request, res: Response) => {
  if (!req.session.mustSetupMfa) {
    return res.redirect("/account/security");
  }

  const secret = generateMfaSecret(req.user!.username);
  req.session.mfaTempSecret = secret.base32;

  res.render("auth/mfa-setup", {
    title: "Set up MFA",
    otpauthUrl: secret.otpauth_url,
    base32: secret.base32
  });
});

router.post("/mfa/setup", requireAuth, async (req: Request, res: Response) => {
  const code = req.body.code?.trim();
  const secret = req.session.mfaTempSecret;

  if (!secret) {
    addFlash(req, "error", "Generate a new MFA secret and try again.");
    return res.redirect("/mfa/setup");
  }
  if (!code) {
    addFlash(req, "error", "Enter the code from your authenticator.");
    return res.redirect("/mfa/setup");
  }

  try {
    await activateMfa(req.user!.id, secret, code);
    req.session.mfaTempSecret = undefined;
    req.session.mustSetupMfa = false;
    req.session.mfaVerified = true;
    addFlash(req, "success", "MFA enabled successfully.");
    res.redirect("/cats");
  } catch (error) {
    addFlash(
      req,
      "error",
      error instanceof Error ? error.message : "Failed to enable MFA."
    );
    return res.redirect("/mfa/setup");
  }
});

router.get("/mfa/verify", requireAuth, (req: Request, res: Response) => {
  if (!req.session.requiresMfa) {
    return res.redirect("/cats");
  }
  res.render("auth/mfa-verify", { title: "Verify MFA" });
});

router.post("/mfa/verify", requireAuth, async (req: Request, res: Response) => {
  const code = req.body.code?.trim();
  const remember = req.body.remember === "on";
  const userId = req.session.mfaUserId ?? req.user?.id;

  if (!userId) {
    addFlash(req, "error", "Something went wrong. Please login again.");
    return res.redirect("/login");
  }
  if (!code) {
    addFlash(req, "error", "Enter your MFA code.");
    return res.redirect("/mfa/verify");
  }

  try {
    const verified = await verifyMfaCode(userId, code);
    if (!verified) {
      addFlash(req, "error", "Invalid code, try again.");
      return res.redirect("/mfa/verify");
    }

    req.session.mfaVerified = true;
    req.session.requiresMfa = false;
    req.session.mfaUserId = undefined;

    if (remember) {
      const deviceToken = uuid();
      await rememberDevice(userId, deviceToken, req.get("user-agent") ?? undefined);
      res.cookie("trusted_device", deviceToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: !isDev,
        maxAge: 1000 * 60 * 60 * 24 * 30
      });
    }

    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const userAgent = req.get("user-agent") ?? undefined;
    await createUserSession(userId, req.sessionID, {
      ip: clientIp,
      userAgent
    });

    if (req.session.pendingPasswordReset) {
      addFlash(req, "info", "Change your password to continue.");
      return res.redirect("/account/password");
    }

    addFlash(req, "success", "Authentication complete.");
    res.redirect("/cats");
  } catch (error) {
    addFlash(
      req,
      "error",
      error instanceof Error ? error.message : "Failed to verify code."
    );
    res.redirect("/mfa/verify");
  }
});

