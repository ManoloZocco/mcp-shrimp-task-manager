import { z } from "zod";
import { getReflectTaskPrompt } from "../../prompts/index.js";

// Task reflection tool
export const reflectTaskSchema = z.object({
  summary: z
    .string()
    .min(10, {
      message: "Task summary cannot be less than 10 characters, please provide more detailed description to ensure task objectives are clear",
    })
    .describe("Structured task summary, maintaining consistency with analysis phase to ensure continuity"),
  analysis: z
    .string()
    .min(100, {
      message: "Technical analysis content is not detailed enough, please provide complete technical analysis and implementation plan",
    })
    .describe(
      "Complete and detailed technical analysis results, including all technical details, dependent components and implementation plans, if code is needed please use pseudocode format and only provide high-level logic flow and key steps avoiding complete code"
    ),
});

export async function reflectTask({
  summary,
  analysis,
}: z.infer<typeof reflectTaskSchema>) {
  // Use prompt generator to get the final prompt
  const prompt = await getReflectTaskPrompt({
    summary,
    analysis,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: prompt,
      },
    ],
  };
}
