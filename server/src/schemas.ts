import { z } from 'zod';

/** Turns '' or whitespace into null, so "cleared" optional fields are stored as NULL. */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

export const contactFields = {
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')).nullable(),
  ),
  phone: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\+?[0-9\s\-().]{7,20}$/, 'Enter a valid phone number')
      .refine((v) => v.replace(/\D/g, '').length >= 7, 'Phone needs at least 7 digits')
      .nullable(),
  ),
  company: optionalText(200),
};

/** PATCH body: any subset of fields, plus the version the client last saw. */
export const updateContactSchema = z
  .object({
    version: z.number().int().positive(),
    firstName: contactFields.firstName.optional(),
    lastName: contactFields.lastName.optional(),
    email: contactFields.email.optional(),
    phone: contactFields.phone.optional(),
    company: contactFields.company.optional(),
  })
  .strict(); // reject unknown keys like "id" or "createdAt"

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const listQuerySchema = z.object({
  q: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(2, 'Search needs at least 2 characters').max(100).optional(),
  ),
  tags: z.string().optional(), // comma-separated tag names, e.g. "VIP,Lead"
  company: z.string().trim().max(200).optional(),
  sort: z.enum(['name', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const tagNameSchema = z.string().trim().min(1, 'Tag name is required').max(50);

export const addTagSchema = z.object({ name: tagNameSchema }).strict();

export const bulkTagSchema = z
  .object({
    contactIds: z
      .array(z.number().int().positive())
      .min(1, 'Select at least one contact')
      .max(500, 'You can tag at most 500 contacts at once'),
    tagName: tagNameSchema,
  })
  .strict();

export const idParam = z.coerce.number().int().positive();
