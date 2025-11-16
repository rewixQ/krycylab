import { NextFunction, Request, Response } from "express";
import { isDev } from "../config/env";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(err);
  if (req.headers.accept?.includes("application/json")) {
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }

  res.status(500).render("error", {
    title: "Something went wrong",
    message: isDev ? err.message : "Please try again later."
  });
};

