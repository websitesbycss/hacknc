import { z } from "zod";

export const EmailAnalysis = z.object({
  kind: z.enum(["event", "receipt", "other"]),
  event: z
    .object({
      title: z.string(),
      startISO: z.string(), // with timezone offset
      endISO: z.string().nullable(), // default to start + 1h in code if null
      location: z.string().nullable(),
      confidence: z.number(), // 0..1
    })
    .nullable(),
  receipt: z
    .object({
      merchant: z.string(),
      amount: z.number(),
      category: z.enum(["food", "shopping", "entertainment", "transport", "bills", "other"]),
    })
    .nullable(),
});
export type EmailAnalysis = z.infer<typeof EmailAnalysis>;

export const VoiceMemoAnalysis = z.object({
  summary: z.array(z.string()).max(3),
  actionItems: z.array(z.object({ text: z.string(), dueISO: z.string().nullable() })),
  moneyOwed: z.array(z.object({ person: z.string(), amount: z.number(), reason: z.string() })),
});
export type VoiceMemoAnalysis = z.infer<typeof VoiceMemoAnalysis>;
