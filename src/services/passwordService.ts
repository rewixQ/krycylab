import bcrypt from "bcryptjs";
import dayjs from "dayjs";
import { prisma } from "../lib/prisma";

const PASSWORD_EXPIRY_DAYS = 90;
const MIN_LENGTH = 12;

export const passwordRules = [
  `At least ${MIN_LENGTH} characters`,
  "At least one uppercase letter",
  "At least one lowercase letter",
  "At least one number",
  "At least one symbol"
];

export const validatePasswordStrength = (password: string) => {
  if (password.length < MIN_LENGTH) {
    return "Password is too short.";
  }
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Add at least one number.";
  if (!/[!@#$%^&*(),.?\":{}|<>\[\]\\\/'`~+-=_-]/.test(password)) {
    return "Add at least one symbol.";
  }
  return null;
};

export const passwordNeedsReset = (user: {
  passwordChangedAt: Date | null;
  passwordExpiry: Date | null;
}) => {
  if (!user.passwordChangedAt) return true;
  if (user.passwordExpiry && user.passwordExpiry < new Date()) return true;
  return false;
};

export const updatePassword = async (userId: number, newPassword: string) => {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true }
  });

  if (!existing) {
    throw new Error("User not found");
  }

  const recentPasswords = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { changedAt: "desc" },
    take: 5
  });

  const reuseChecks = [existing.password, ...recentPasswords.map((p) => p.oldPassword)];

  for (const hash of reuseChecks) {
    const matches = await bcrypt.compare(newPassword, hash);
    if (matches) {
      throw new Error("Password was used recently. Choose a new one.");
    }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  const expiry = dayjs().add(PASSWORD_EXPIRY_DAYS, "day").toDate();

  await prisma.$transaction([
    prisma.passwordHistory.create({
      data: { userId, oldPassword: existing.password }
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        passwordExpiry: expiry
      }
    })
  ]);
};

