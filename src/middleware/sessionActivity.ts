import { NextFunction, Request, Response } from "express";
import { touchSession } from "../services/authService";

export const sessionActivityTracker = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (req.sessionID && req.isAuthenticated()) {
    touchSession(req.sessionID).catch((error) => {
      console.error("Failed to touch session", error);
    });
  }
  next();
};

