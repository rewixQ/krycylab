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

  console.log('MFA Enforcer:', {
    path: req.path,
    mustSetupMfa: req.session.mustSetupMfa,
    mfaVerified: req.session.mfaVerified,
    requiresMfa: req.session.requiresMfa,
    isAuthenticated: req.isAuthenticated()
  });

  // MFA setup is mandatory for users without MFA configured
  if (
    req.session.mustSetupMfa &&
    !req.path.startsWith("/mfa/setup") &&
    !req.path.startsWith("/logout")
  ) {
    console.log('MFA Enforcer: Redirecting to setup');
    return res.redirect("/mfa/setup");
  }

  if (req.session.mfaVerified) {
    console.log('MFA Enforcer: Allowing access (verified)');
    return next();
  }

  if (
    ALLOWED_PATHS.some((path) => req.path.startsWith(path)) ||
    req.path.startsWith("/public") ||
    req.path.startsWith("/healthz")
  ) {
    console.log('MFA Enforcer: Allowing access (allowed path)');
    return next();
  }

  console.log('MFA Enforcer: Redirecting to verify');
  return res.redirect("/mfa/verify");
};

