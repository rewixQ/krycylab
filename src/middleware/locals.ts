import { NextFunction, Request, Response } from "express";
import { consumeFlash } from "../lib/flash";
import { roleList } from "../lib/roles";

export const attachLocals = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.locals.currentUser = req.user;
  res.locals.roles = roleList;
  res.locals.flash = consumeFlash(req);
  next();
};

