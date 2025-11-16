import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const roles = [
    { roleName: "superadmin", description: "Top-level administrator" },
    { roleName: "admin", description: "Administrator" },
    { roleName: "caretaker", description: "Cat caretaker" }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { roleName: role.roleName },
      update: {},
      create: role
    });
  }

  const superRole = await prisma.role.findUnique({
    where: { roleName: "superadmin" }
  });

  if (!superRole) {
    throw new Error("Superadmin role missing after seed.");
  }

  const password =
    process.env.SUPERADMIN_PASSWORD?.trim() || "ChangeMe123!";
  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      password: hashedPassword,
      roleId: superRole.roleId,
      isDeleted: false,
      isActive: true
    },
    create: {
      username: "admin",
      email: process.env.SUPERADMIN_EMAIL?.trim() || "admin@example.com",
      password: hashedPassword,
      roleId: superRole.roleId,
      passwordChangedAt: new Date()
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

