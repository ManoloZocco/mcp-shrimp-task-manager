/**
 * initProjectRules prompt generator
 * Responsible for combining templates and parameters into the final prompt
 */

import { loadPrompt, loadPromptFromTemplate } from "../loader.js";
/**
 * initProjectRules prompt parameters interface
 */
export interface InitProjectRulesPromptParams {
  // Currently no additional parameters, can be expanded as needed in the future
}

/**
 * Get the complete prompt for initProjectRules
 * @param params prompt parameters (optional)
 * @returns generated prompt
 */
export async function getInitProjectRulesPrompt(
  params?: InitProjectRulesPromptParams
): Promise<string> {
  const indexTemplate = await loadPromptFromTemplate(
    "initProjectRules/index.md"
  );

  // Load possible custom prompt (override or append via environment variables)
  return loadPrompt(indexTemplate, "INIT_PROJECT_RULES");
}
