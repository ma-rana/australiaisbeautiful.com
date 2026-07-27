// lib/schemas/support.ts — Zod for the public support/help/bug form.
//
// Deliberately forgiving: the only required thing is a message with some
// substance. Email is optional (an anonymous sender may not want to leave one,
// and forcing it suppresses reports). Category defaults are handled in the UI.

import { z } from "zod";

export const SupportSchema = z.object({
  category: z.enum(["BUG", "HELP", "CONTENT_REPORT"]),
  // A real message. 10 chars filters out "test" / empty noise without being
  // precious; 4000 is a generous ceiling that still stops a paste-bomb.
  body: z
    .string()
    .trim()
    .min(10, "Tell us a little more — a sentence or two helps.")
    .max(4000, "That's very long — please trim it to the essentials."),
  // Optional. Normalised like everywhere else. Empty string → undefined so we
  // store null, not "".
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That doesn't look like an email address.")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Context, captured by the form, not typed by the user. Bounded so a crafted
  // client can't stuff them.
  path: z.string().trim().max(512).optional(),
});

export type SupportInput = z.infer<typeof SupportSchema>;
