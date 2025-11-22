import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const roles = [
    { role_name: "superadmin", description: "Top-level administrator" },
    { role_name: "admin", description: "Administrator" },
    { role_name: "caretaker", description: "Cat caretaker" }
  ];

  for (const role of roles) {
    await (prisma as any).roles.upsert({
      where: { role_name: role.role_name },
      update: {},
      create: role
    });
  }

  const superRole = await (prisma as any).roles.findUnique({
    where: { role_name: "superadmin" }
  });

  if (!superRole) {
    throw new Error("Superadmin role missing after seed.");
  }

  const password =
    process.env.SUPERADMIN_PASSWORD?.trim() || "ChangeMe123!";
  const hashedPassword = await bcrypt.hash(password, 12);

  await (prisma as any).users.upsert({
    where: { username: "admin" },
    update: {
      password_hash: hashedPassword,
      role_id: superRole.role_id,
      is_active: true
    },
    create: {
      username: "admin",
      email: process.env.SUPERADMIN_EMAIL?.trim() || "admin@example.com",
      password_hash: hashedPassword,
      role_id: superRole.role_id,
      last_password_change: new Date()
    }
  });

  console.log("Seeded roles and superadmin account (username: admin).");
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

