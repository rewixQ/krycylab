import { NextFunction, Request, Response } from "express";
import { addFlash } from "../lib/flash";
import { hasRequiredRole, RoleName } from "../lib/roles";

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.isAuthenticated()) {
    return next();
  }
  addFlash(req, "info", "Please sign in to continue.");
  res.redirect("/login");
};

export const requireMfa = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session.mfaVerified) {
    return next();
  }
  res.redirect("/mfa/verify");
};

export const requireRole = (role: RoleName) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const currentRole = req.user?.roleName as RoleName | undefined;
    if (hasRequiredRole(currentRole, role)) {
      return next();
    }
    res.status(403).render("403", { title: "Forbidden" });
  };
};

