import { z } from "zod";
import { searchTasksWithCommand } from "../../models/taskModel.js";
import { getGetTaskDetailPrompt } from "../../prompts/index.js";

// Get parameters for full task details
export const getTaskDetailSchema = z.object({
  taskId: z
    .string()
    .min(1, {
      message: "Task ID cannot be empty, please provide a valid task ID",
    })
    .describe("Task ID for which details are to be viewed"),
});

// Get complete task details
export async function getTaskDetail({
  taskId,
}: z.infer<typeof getTaskDetailSchema>) {
  try {
    // Use searchTasksWithCommand instead of getTaskById to implement memory area task search
    // Set isId to true to indicate search by ID; page number is 1, page size is 1
    const result = await searchTasksWithCommand(taskId, true, 1, 1);

    // Check if task was found
    if (result.tasks.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `## Error\n\nCannot find task with ID \`${taskId}\`. Please confirm the task ID is correct.`,
          },
        ],
        isError: true,
      };
    }

    // Get the found task (the first and only one)
    const task = result.tasks[0];

    // Use prompt generator to get the final prompt
    const prompt = await getGetTaskDetailPrompt({
      taskId,
      task,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    };
  } catch (error) {
    // Use prompt generator to get error message
    const errorPrompt = await getGetTaskDetailPrompt({
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      content: [
        {
          type: "text" as const,
          text: errorPrompt,
        },
      ],
    };
  }
}
