import { Request } from "express";

export type FlashKind = "success" | "error" | "info";

export const addFlash = (req: Request, type: FlashKind, message: string) => {
  req.session.flash ??= {};
  const existing = req.session.flash[type] ?? [];
  req.session.flash[type] = [...existing, message];
};

export const consumeFlash = (req: Request) => {
  const flash = req.session.flash ?? {};
  delete req.session.flash;
  return flash;
};

