/**
 * getTaskDetail prompt generator
 * Responsible for combining templates and parameters into the final prompt
 */

import {
  loadPrompt,
  generatePrompt,
  loadPromptFromTemplate,
} from "../loader.js";
import { Task } from "../../types/index.js";

/**
 * getTaskDetail prompt parameter interface
 */
export interface GetTaskDetailPromptParams {
  taskId: string;
  task?: Task | null;
  error?: string;
}

/**
 * Get the complete prompt for getTaskDetail
 * @param params prompt parameters
 * @returns generated prompt
 */
export async function getGetTaskDetailPrompt(
  params: GetTaskDetailPromptParams
): Promise<string> {
  const { taskId, task, error } = params;

  // If there is an error, display error message
  if (error) {
    const errorTemplate = await loadPromptFromTemplate(
      "getTaskDetail/error.md"
    );
    return generatePrompt(errorTemplate, {
      errorMessage: error,
    });
  }

  // If task cannot be found, display task not found message
  if (!task) {
    const notFoundTemplate = await loadPromptFromTemplate(
      "getTaskDetail/notFound.md"
    );
    return generatePrompt(notFoundTemplate, {
      taskId,
    });
  }

  let notesPrompt = "";
  if (task.notes) {
    const notesTemplate = await loadPromptFromTemplate(
      "getTaskDetail/notes.md"
    );
    notesPrompt = generatePrompt(notesTemplate, {
      notes: task.notes,
    });
  }

  let dependenciesPrompt = "";
  if (task.dependencies && task.dependencies.length > 0) {
    const dependenciesTemplate = await loadPromptFromTemplate(
      "getTaskDetail/dependencies.md"
    );
    dependenciesPrompt = generatePrompt(dependenciesTemplate, {
      dependencies: task.dependencies
        .map((dep) => `\`${dep.taskId}\``)
        .join(", "),
    });
  }

  let implementationGuidePrompt = "";
  if (task.implementationGuide) {
    const implementationGuideTemplate = await loadPromptFromTemplate(
      "getTaskDetail/implementationGuide.md"
    );
    implementationGuidePrompt = generatePrompt(implementationGuideTemplate, {
      implementationGuide: task.implementationGuide,
    });
  }

  let verificationCriteriaPrompt = "";
  if (task.verificationCriteria) {
    const verificationCriteriaTemplate = await loadPromptFromTemplate(
      "getTaskDetail/verificationCriteria.md"
    );
    verificationCriteriaPrompt = generatePrompt(verificationCriteriaTemplate, {
      verificationCriteria: task.verificationCriteria,
    });
  }

  let relatedFilesPrompt = "";
  if (task.relatedFiles && task.relatedFiles.length > 0) {
    const relatedFilesTemplate = await loadPromptFromTemplate(
      "getTaskDetail/relatedFiles.md"
    );
    relatedFilesPrompt = generatePrompt(relatedFilesTemplate, {
      files: task.relatedFiles
        .map(
          (file) =>
            `- \`${file.path}\` (${file.type})${file.description ? `: ${file.description}` : ""
            }`
        )
        .join("\n"),
    });
  }

  let complatedSummaryPrompt = "";
  if (task.completedAt) {
    const complatedSummaryTemplate = await loadPromptFromTemplate(
      "getTaskDetail/complatedSummary.md"
    );
    complatedSummaryPrompt = generatePrompt(complatedSummaryTemplate, {
      completedTime: new Date(task.completedAt).toLocaleString("en-US"),
      summary: task.summary || "*No completion summary*",
    });
  }

  const indexTemplate = await loadPromptFromTemplate("getTaskDetail/index.md");

  // Start building the basic prompt
  let prompt = generatePrompt(indexTemplate, {
    name: task.name,
    id: task.id,
    status: task.status,
    description: task.description,
    notesTemplate: notesPrompt,
    dependenciesTemplate: dependenciesPrompt,
    implementationGuideTemplate: implementationGuidePrompt,
    verificationCriteriaTemplate: verificationCriteriaPrompt,
    relatedFilesTemplate: relatedFilesPrompt,
    createdTime: new Date(task.createdAt).toLocaleString("en-US"),
    updatedTime: new Date(task.updatedAt).toLocaleString("en-US"),
    complatedSummaryTemplate: complatedSummaryPrompt,
  });

  // Load possible custom prompt
  return loadPrompt(prompt, "GET_TASK_DETAIL");
}
