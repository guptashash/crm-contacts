import { z } from 'zod';

/**
 * Client-side rules, matching the server's (server/src/schemas.ts).
 * The server validates again: the client check is for fast feedback, not security.
 */
export const contactFormSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100, 'At most 100 characters'),
  lastName: z.string().trim().max(100, 'At most 100 characters'),
  email: z
    .string()
    .trim()
    .max(254, 'At most 254 characters')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[0-9\s\-().]{7,20}$/.test(v), 'Enter a valid phone number')
    .refine((v) => v === '' || v.replace(/\D/g, '').length >= 7, 'Phone needs at least 7 digits'),
  company: z.string().trim().max(200, 'At most 200 characters'),
});
