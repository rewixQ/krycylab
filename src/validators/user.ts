import { z } from "zod";

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(64),
  email: z.string().trim().email("Provide a valid email."),
  roleId: z.coerce.number().int().positive(),
  password: z.string().min(8, "Password must be at least 8 characters.")
});

export type CreateUserPayload = z.infer<typeof createUserSchema>;

export const parseCreateUser = (payload: unknown) => {
  const result = createUserSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid user payload.");
  }
  return result.data;
};

