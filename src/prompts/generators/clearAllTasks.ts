/**
 * clearAllTasks prompt generator
 * Responsible for combining templates and parameters into the final prompt
 */
/**
 * clearAllTasks prompt generator
 * Responsible for combining templates and parameters into the final prompt
 */

import {
  loadPrompt,
  generatePrompt,
  loadPromptFromTemplate,
} from "../loader.js";

/**
 * clearAllTasks prompt parameter interface
 */
/**
 * clearAllTasks prompt parameter interface
 */
export interface ClearAllTasksPromptParams {
  confirm?: boolean;
  success?: boolean;
  message?: string;
  backupFile?: string;
  isEmpty?: boolean;
}

/**
 * Get complete prompt for clearAllTasks
 * @param params prompt parameters
 * @returns generated prompt
 */
/**
 * Get complete prompt for clearAllTasks
 * @param params prompt parameters
 * @returns generated prompt
 */
export async function getClearAllTasksPrompt(
  params: ClearAllTasksPromptParams
): Promise<string> {
  const { confirm, success, message, backupFile, isEmpty } = params;

  // Handle unconfirmed situations
  if (confirm === false) {
    const cancelTemplate = await loadPromptFromTemplate(
      "clearAllTasks/cancel.md"
    );
    return generatePrompt(cancelTemplate, {});
  }

  // Handle situations where no tasks need to be cleared
  if (isEmpty) {
    const emptyTemplate = await loadPromptFromTemplate(
      "clearAllTasks/empty.md"
    );
    return generatePrompt(emptyTemplate, {});
  }

  // Handle success or failure situations for clearing
  const responseTitle = success ? "Success" : "Failure";

  // Use template to generate backupInfo
  const backupInfo = backupFile
    ? generatePrompt(
      await loadPromptFromTemplate("clearAllTasks/backupInfo.md"),
      {
        backupFile,
      }
    )
    : "";

  const indexTemplate = await loadPromptFromTemplate("clearAllTasks/index.md");
  const prompt = generatePrompt(indexTemplate, {
    responseTitle,
    message,
    backupInfo,
  });

  // Load possible custom prompt
  return loadPrompt(prompt, "CLEAR_ALL_TASKS");
}
