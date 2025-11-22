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
  last_password_change: Date | null;
  password_expires_at: Date | null;
}) => {
  if (!user.last_password_change) return true;
  if (user.password_expires_at && user.password_expires_at < new Date()) return true;
  return false;
};

export const updatePassword = async (user_id: number, newPassword: string) => {
  const existing = await prisma.users.findUnique({
    where: { user_id },
    select: { password_hash: true, is_active: true }
  });

  if (!existing || !existing.is_active) {
    throw new Error("User not found or inactive");
  }

  const recentPasswords = await prisma.passwordhistory.findMany({
    where: { user_id },
    orderBy: { changed_at: "desc" },
    take: 5
  });

  const reuseChecks = [existing.password_hash, ...recentPasswords.map((p) => p.old_password_hash)];

  for (const hash of reuseChecks) {
    const matches = await bcrypt.compare(newPassword, hash);
    if (matches) {
      throw new Error("Password was used recently. Choose a new one.");
    }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  const expiry = dayjs().add(PASSWORD_EXPIRY_DAYS, "day").toDate();

  await prisma.$transaction([
    prisma.passwordhistory.create({
      data: { user_id, old_password_hash: existing.password_hash }
    }),
    prisma.users.update({
      where: { user_id },
      data: {
        password_hash: hashedPassword,
        last_password_change: new Date(),
        password_expires_at: expiry,
        password_change_required: false
      }
    })
  ]);
};

