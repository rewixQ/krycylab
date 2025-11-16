export type RoleName = "caretaker" | "admin" | "superadmin";

const ROLE_PRIORITY: Record<RoleName, number> = {
  caretaker: 1,
  admin: 2,
  superadmin: 3
};

export const hasRequiredRole = (
  current: RoleName | null | undefined,
  required: RoleName
) => {
  if (!current) return false;
  return ROLE_PRIORITY[current] >= ROLE_PRIORITY[required];
};

export const roleList: RoleName[] = ["superadmin", "admin", "caretaker"];

