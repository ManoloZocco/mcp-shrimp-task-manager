/**
 * reflectTask prompt generator
 * Responsible for combining templates and parameters into the final prompt
 */

import {
  loadPrompt,
  generatePrompt,
  loadPromptFromTemplate,
} from "../loader.js";

/**
 * reflectTask prompt parameter interface
 */
export interface ReflectTaskPromptParams {
  summary: string;
  analysis: string;
}

/**
 * Get the complete reflectTask prompt
 * @param params prompt parameters
 * @returns generated prompt
 */
export async function getReflectTaskPrompt(
  params: ReflectTaskPromptParams
): Promise<string> {
  const indexTemplate = await loadPromptFromTemplate("reflectTask/index.md");
  const prompt = generatePrompt(indexTemplate, {
    summary: params.summary,
    analysis: params.analysis,
  });

  // Load possible custom prompt
  return loadPrompt(prompt, "REFLECT_TASK");
}
