import { z } from "zod";
import { getAnalyzeTaskPrompt } from "../../prompts/index.js";

// Task analysis tool
export const analyzeTaskSchema = z.object({
  summary: z
    .string()
    .min(10, {
      message: "Task summary must be at least 10 characters long, please provide a more detailed description to ensure clear task objectives",
    })
    .describe(
      "Structured task summary including task objectives, scope and key technical challenges, minimum 10 characters"
    ),
  initialConcept: z
    .string()
    .min(50, {
      message:
        "Initial solution concept must be at least 50 characters long, please provide more detailed content to ensure clear technical solution",
    })
    .describe(
      "Initial solution concept of at least 50 characters, including technical solution, architectural design and implementation strategy. If code is needed, use pseudocode format providing only high-level logic flow and key steps, avoiding complete code"
    ),
  previousAnalysis: z
    .string()
    .optional()
    .describe("Previous iteration analysis results, used for continuous solution improvement (only required when re-analyzing)"),
});

export async function analyzeTask({
  summary,
  initialConcept,
  previousAnalysis,
}: z.infer<typeof analyzeTaskSchema>) {
  // Use prompt generator to get the final prompt
  const prompt = await getAnalyzeTaskPrompt({
    summary,
    initialConcept,
    previousAnalysis,
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
