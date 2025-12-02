/**
 * researchMode prompt generator
 * Responsible for combining templates and parameters into the final prompt
 */

import {
  loadPrompt,
  generatePrompt,
  loadPromptFromTemplate,
} from "../loader.js";

/**
 * researchMode prompt parameter interface
 */
export interface ResearchModePromptParams {
  topic: string;
  previousState: string;
  currentState: string;
  nextSteps: string;
  memoryDir: string;
}

/**
 * Get the complete researchMode prompt
 * @param params prompt parameters
 * @returns generated prompt
 */
export async function getResearchModePrompt(
  params: ResearchModePromptParams
): Promise<string> {
  // Process previous research state
  let previousStateContent = "";
  if (params.previousState && params.previousState.trim() !== "") {
    const previousStateTemplate = await loadPromptFromTemplate(
      "researchMode/previousState.md"
    );
    previousStateContent = generatePrompt(previousStateTemplate, {
      previousState: params.previousState,
    });
  } else {
    previousStateContent = "This is the first research on this topic, no previous research state.";
  }

  // Load main template
  const indexTemplate = await loadPromptFromTemplate("researchMode/index.md");
  let prompt = generatePrompt(indexTemplate, {
    topic: params.topic,
    previousStateContent: previousStateContent,
    currentState: params.currentState,
    nextSteps: params.nextSteps,
    memoryDir: params.memoryDir,
    time: new Date().toLocaleString(),
  });

  // Load possible custom prompt
  return loadPrompt(prompt, "RESEARCH_MODE");
}
