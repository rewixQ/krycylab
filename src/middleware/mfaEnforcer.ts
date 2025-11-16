import { NextFunction, Request, Response } from "express";

const ALLOWED_PATHS = ["/mfa", "/logout"];

export const mfaEnforcer = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.isAuthenticated()) {
    return next();
  }

  if (
    req.session.mustSetupMfa &&
    !req.path.startsWith("/mfa/setup") &&
    !req.path.startsWith("/logout")
  ) {
    return res.redirect("/mfa/setup");
  }

  if (req.session.mfaVerified) {
    return next();
  }

  if (
    ALLOWED_PATHS.some((path) => req.path.startsWith(path)) ||
    req.path.startsWith("/public") ||
    req.path.startsWith("/healthz")
  ) {
    return next();
  }

  return res.redirect("/mfa/verify");
};

