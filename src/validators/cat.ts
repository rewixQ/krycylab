import { z } from "zod";

const optionalString = z
  .preprocess((value) =>
    typeof value === "string" ? value.trim() : undefined
  )
  .optional()
  .refine((val) => !val || val.length <= 128, {
    message: "Value is too long."
  });

export const catSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(64, "Name is too long."),
  breed: optionalString,
  friends: optionalString,
  birthDate: z
    .preprocess((value) => {
      if (typeof value !== "string" || !value.trim()) return undefined;
      return value.trim();
    }, z.string().optional())
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

