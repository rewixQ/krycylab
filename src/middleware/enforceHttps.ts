import { NextFunction, Request, Response } from "express";
import { enforceHttpsFlag } from "../config/env";

export const enforceHttps = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!enforceHttpsFlag) return next();
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (req.secure || forwardedProto === "https") {
    return next();
  }
  return res.redirect(`https://${req.headers.host}${req.originalUrl}`);
};

