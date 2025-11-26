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
    .string({ message: "Birth date is required." })
    .min(1, "Birth date is required.")
    .refine(
      (val) => !Number.isNaN(Date.parse(val)),
      "Birth date must be a valid date."
    )
});

export type CatPayload = z.infer<typeof catSchema>;

export type CatValidationErrors = Partial<Record<keyof CatPayload, string>>;

export type CatValidationResult =
  | { success: true; data: CatPayload; errors: null }
  | { success: false; data: null; errors: CatValidationErrors };

export const validateCatPayload = (payload: unknown): CatValidationResult => {
  const result = catSchema.safeParse(payload);
  if (!result.success) {
    const errors: CatValidationErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof CatPayload;
      if (!errors[field]) {
        errors[field] = issue.message;
      }
    }
    return { success: false, data: null, errors };
  }
  return { success: true, data: result.data, errors: null };
};

/** @deprecated Use validateCatPayload instead for better error handling */
export const parseCatPayload = (payload: unknown) => {
  const result = catSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid cat payload.");
  }
  return result.data;
};

