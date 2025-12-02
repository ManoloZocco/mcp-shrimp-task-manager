import { z } from "zod";
import {
  getAllTasks,
  clearAllTasks as modelClearAllTasks,
} from "../../models/taskModel.js";
import { getClearAllTasksPrompt } from "../../prompts/index.js";

// Clear all tasks tool
export const clearAllTasksSchema = z.object({
  confirm: z
    .boolean()
    .refine((val) => val === true, {
      message:
        "Must explicitly confirm clear operation, please set confirm parameter to true to confirm this dangerous operation",
    })
    .describe("Confirm deletion of all incomplete tasks (this operation is irreversible)"),
});

export async function clearAllTasks({
  confirm,
}: z.infer<typeof clearAllTasksSchema>) {
  // Safety check: refuse operation if not confirmed
  if (!confirm) {
    return {
      content: [
        {
          type: "text" as const,
          text: await getClearAllTasksPrompt({ confirm: false }),
        },
      ],
    };
  }


  // Check if there are actually tasks that need to be cleared
  const allTasks = await getAllTasks();
  if (allTasks.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: await getClearAllTasksPrompt({ isEmpty: true }),
        },
      ],
    };
  }

  // Execute clear operation
  const result = await modelClearAllTasks();

  return {
    content: [
      {
        type: "text" as const,
        text: await getClearAllTasksPrompt({
          success: result.success,
          message: result.message,
          backupFile: result.backupFile,
        }),
      },
    ],
    isError: !result.success,
  };
}
