import { z } from "zod";

export const catSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(64, "Name is too long."),
  breed: z
    .string()
    .trim()
    .max(64, "Breed is too long.")
    .optional()
    .or(z.literal("")),
  friends: z
    .string()
    .trim()
    .max(128, "Friends description is too long.")
    .optional()
    .or(z.literal("")),
  birthDate: z
    .string()
    .optional()
    .refine(
      (val) => !val || !Number.isNaN(Date.parse(val)),
      "Birth date must be a valid date."
    )
});

export type CatPayload = z.infer<typeof catSchema>;

export const parseCatPayload = (payload: unknown) => {
  const result = catSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid cat payload.");
  }
  return result.data;
};

