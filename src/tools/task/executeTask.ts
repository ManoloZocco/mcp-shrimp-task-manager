import { z } from "zod";
import { UUID_V4_REGEX } from "../../utils/regex.js";
import {
  getTaskById,
  updateTaskStatus,
  canExecuteTask,
  assessTaskComplexity,
} from "../../models/taskModel.js";
import { TaskStatus, Task } from "../../types/index.js";
import { getExecuteTaskPrompt } from "../../prompts/index.js";
import { loadTaskRelatedFiles } from "../../utils/fileLoader.js";

// Execute task tool
export const executeTaskSchema = z.object({
  taskId: z
    .string()
    .regex(UUID_V4_REGEX, {
      message: "Task ID format is invalid, please provide a valid UUID v4 format",
    })
    .describe("Unique identifier of the task to be executed, must be a valid task ID that exists in the system"),
});

export async function executeTask({
  taskId,
}: z.infer<typeof executeTaskSchema>) {
  try {
    // Check if task exists
    const task = await getTaskById(taskId);
    if (!task) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Cannot find task with ID \`${taskId}\`. Please confirm if the ID is correct.`,
          },
        ],
      };
    }

    // Check if task can be executed (all dependency tasks are completed)
    const executionCheck = await canExecuteTask(taskId);
    if (!executionCheck.canExecute) {
      const blockedByTasksText =
        executionCheck.blockedBy && executionCheck.blockedBy.length > 0
          ? `Blocked by the following incomplete dependency tasks: ${executionCheck.blockedBy.join(", ")}`
          : "Unable to determine blocking reason";

      return {
        content: [
          {
            type: "text" as const,
            text: `Task "${task.name}" (ID: \`${taskId}\`) cannot be executed currently. ${blockedByTasksText}`,
          },
        ],
      };
    }

    // If task is already marked as "in progress", prompt user
    if (task.status === TaskStatus.IN_PROGRESS) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task "${task.name}" (ID: \`${taskId}\`) is already in progress status.`,
          },
        ],
      };
    }

    // If task is already marked as "completed", prompt user
    if (task.status === TaskStatus.COMPLETED) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task "${task.name}" (ID: \`${taskId}\`) is already marked as completed. If you need to re-execute, please first use delete_task to delete the task and recreate it.`,
          },
        ],
      };
    }

    // Update task status to "in progress"
    await updateTaskStatus(taskId, TaskStatus.IN_PROGRESS);

    // Assess task complexity
    const complexityResult = await assessTaskComplexity(taskId);

    // Convert complexity results to appropriate format
    const complexityAssessment = complexityResult
      ? {
        level: complexityResult.level,
        metrics: {
          descriptionLength: complexityResult.metrics.descriptionLength,
          dependenciesCount: complexityResult.metrics.dependenciesCount,
        },
        recommendations: complexityResult.recommendations,
      }
      : undefined;

    // Get dependency tasks for displaying completion summary
    const dependencyTasks: Task[] = [];
    if (task.dependencies && task.dependencies.length > 0) {
      for (const dep of task.dependencies) {
        const depTask = await getTaskById(dep.taskId);
        if (depTask) {
          dependencyTasks.push(depTask);
        }
      }
    }

    // Load task-related file content
    let relatedFilesSummary = "";
    if (task.relatedFiles && task.relatedFiles.length > 0) {
      try {
        const relatedFilesResult = await loadTaskRelatedFiles(
          task.relatedFiles
        );
        relatedFilesSummary =
          typeof relatedFilesResult === "string"
            ? relatedFilesResult
            : relatedFilesResult.summary || "";
      } catch (error) {
        relatedFilesSummary =
          "Error loading related files, please check the files manually.";
      }
    }

    // Use prompt generator to get final prompt
    const prompt = await getExecuteTaskPrompt({
      task,
      complexityAssessment,
      relatedFilesSummary,
      dependencyTasks,
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
    return {
      content: [
        {
          type: "text" as const,
          text: `Error occurred while executing task: ${error instanceof Error ? error.message : String(error)
            }`,
        },
      ],
    };
  }
}
