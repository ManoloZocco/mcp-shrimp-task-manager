import { z } from "zod";
import { UUID_V4_REGEX } from "../../utils/regex.js";
import {
  getTaskById,
  updateTaskContent as modelUpdateTaskContent,
} from "../../models/taskModel.js";
import { RelatedFileType } from "../../types/index.js";
import { getUpdateTaskContentPrompt } from "../../prompts/index.js";

// Update task content tool
export const updateTaskContentSchema = z.object({
  taskId: z
    .string()
    .regex(UUID_V4_REGEX, {
      message: "Task ID format is invalid, please provide a valid UUID v4 format",
    })
    .describe("Unique identifier of the task to be updated, must be a task ID that exists in the system and is not completed"),
  name: z.string().optional().describe("New name of the task (optional)"),
  description: z.string().optional().describe("New description content of the task (optional)"),
  notes: z.string().optional().describe("New additional notes of the task (optional)"),
  dependencies: z
    .array(z.string())
    .optional()
    .describe("New dependency relationships of the task (optional)"),
  relatedFiles: z
    .array(
      z.object({
        path: z
          .string()
          .min(1, { message: "File path cannot be empty, please provide a valid file path" })
          .describe("File path, can be a path relative to the project root directory or an absolute path"),
        type: z
          .nativeEnum(RelatedFileType)
          .describe(
            "File relationship type with task (TO_MODIFY, REFERENCE, CREATE, DEPENDENCY, OTHER)"
          ),
        description: z.string().optional().describe("Additional description of the file (optional)"),
        lineStart: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Starting line of the related code block (optional)"),
        lineEnd: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Ending line of the related code block (optional)"),
      })
    )
    .optional()
    .describe(
      "List of files related to the task, used to record code files, reference materials, files to be created, etc. related to the task (optional)"
    ),
  implementationGuide: z
    .string()
    .optional()
    .describe("New implementation guide for the task (optional)"),
  verificationCriteria: z
    .string()
    .optional()
    .describe("New verification criteria for the task (optional)"),
});

export async function updateTaskContent({
  taskId,
  name,
  description,
  notes,
  relatedFiles,
  dependencies,
  implementationGuide,
  verificationCriteria,
}: z.infer<typeof updateTaskContentSchema>) {
  if (relatedFiles) {
    for (const file of relatedFiles) {
      if (
        (file.lineStart && !file.lineEnd) ||
        (!file.lineStart && file.lineEnd) ||
        (file.lineStart && file.lineEnd && file.lineStart > file.lineEnd)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: await getUpdateTaskContentPrompt({
                taskId,
                validationError:
                  "Invalid line number settings: start line and end line must be set simultaneously, and start line must be less than end line",
              }),
            },
          ],
        };
      }
    }
  }

  if (
    !(
      name ||
      description ||
      notes ||
      dependencies ||
      implementationGuide ||
      verificationCriteria ||
      relatedFiles
    )
  ) {
    return {
      content: [
        {
          type: "text" as const,
          text: await getUpdateTaskContentPrompt({
            taskId,
            emptyUpdate: true,
          }),
        },
      ],
    };
  }

  // Get task to check if it exists
  const task = await getTaskById(taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text" as const,
          text: await getUpdateTaskContentPrompt({
            taskId,
          }),
        },
      ],
      isError: true,
    };
  }

  // Record the task and content to be updated
  let updateSummary = `Preparing to update task: ${task.name} (ID: ${task.id})`;
  if (name) updateSummary += `, new name: ${name}`;
  if (description) updateSummary += `, update description`;
  if (notes) updateSummary += `, update notes`;
  if (relatedFiles)
    updateSummary += `, update related files (${relatedFiles.length} files)`;
  if (dependencies)
    updateSummary += `, update dependencies (${dependencies.length} items)`;
  if (implementationGuide) updateSummary += `, update implementation guide`;
  if (verificationCriteria) updateSummary += `, update verification criteria`;

  // Execute update operation
  const result = await modelUpdateTaskContent(taskId, {
    name,
    description,
    notes,
    relatedFiles,
    dependencies,
    implementationGuide,
    verificationCriteria,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: await getUpdateTaskContentPrompt({
          taskId,
          task,
          success: result.success,
          message: result.message,
          updatedTask: result.task,
        }),
      },
    ],
    isError: !result.success,
  };
}
