// Task status enumeration: Defines the current stage of tasks in the workflow
export enum TaskStatus {
  PENDING = "pending", // Created but not yet started tasks
  IN_PROGRESS = "in_progress", // Currently executing tasks
  COMPLETED = "completed", // Successfully completed and verified tasks
  BLOCKED = "blocked", // Tasks temporarily unable to execute due to dependencies
}

// Task dependency: Defines prerequisite relationships between tasks
export interface TaskDependency {
  taskId: string; // Unique identifier of prerequisite task, must be completed before current task execution
}

// Related file type: Defines the relationship type between files and tasks
export enum RelatedFileType {
  TO_MODIFY = "TO_MODIFY", // Files that need to be modified in the task
  REFERENCE = "REFERENCE", // Reference materials or related documents for the task
  CREATE = "CREATE", // Files that need to be created in the task
  DEPENDENCY = "DEPENDENCY", // Components or library files that the task depends on
  OTHER = "OTHER", // Other types of related files
}

// Related file: Defines file information related to tasks
export interface RelatedFile {
  path: string; // File path, can be relative to project root or absolute path
  type: RelatedFileType; // Relationship type between file and task
  description?: string; // Supplementary description of the file, explaining its specific relationship or purpose with the task
  lineStart?: number; // Starting line of related code block (optional)
  lineEnd?: number; // Ending line of related code block (optional)
}

// Task interface: Defines the complete data structure of tasks
export interface Task {
  id: string; // Unique identifier of the task
  name: string; // Concise and clear task name
  description: string; // Detailed task description, including implementation points and acceptance criteria
  notes?: string; // Supplementary notes, special handling requirements or implementation suggestions (optional)
  status: TaskStatus; // Current execution status of the task
  dependencies: TaskDependency[]; // List of prerequisite dependencies for the task
  createdAt: Date; // Timestamp when the task was created
  updatedAt: Date; // Timestamp of last task update
  completedAt?: Date; // Timestamp when task was completed (only for completed tasks)
  summary?: string; // Task completion summary, briefly describing implementation results and important decisions (only for completed tasks)
  relatedFiles?: RelatedFile[]; // List of files related to the task (optional)

  // New field: Save complete technical analysis results
  analysisResult?: string; // Complete analysis results from analyze_task and reflect_task stages

  // Agent system related fields
  agent?: string; // The most suitable agent type to handle this task

  // New field: Save specific implementation guide
  implementationGuide?: string; // Specific implementation methods, steps and recommendations

  // New field: Save verification standards and inspection methods
  verificationCriteria?: string; // Clear verification standards, test points and acceptance conditions
}

// Task complexity level: Defines task complexity classification
export enum TaskComplexityLevel {
  LOW = "Low Complexity", // Simple and straightforward tasks, usually no special handling required
  MEDIUM = "Medium Complexity", // Tasks with some complexity but still manageable
  HIGH = "High Complexity", // Complex and time-consuming tasks that require special attention
  VERY_HIGH = "Very High Complexity", // Extremely complex tasks, recommended to be split for processing
}

// Task complexity thresholds: Defines reference standards for task complexity assessment
export const TaskComplexityThresholds = {
  DESCRIPTION_LENGTH: {
    MEDIUM: 500, // Above this word count is classified as medium complexity
    HIGH: 1000, // Above this word count is classified as high complexity
    VERY_HIGH: 2000, // Above this word count is classified as very high complexity
  },
  DEPENDENCIES_COUNT: {
    MEDIUM: 2, // Above this dependency count is classified as medium complexity
    HIGH: 5, // Above this dependency count is classified as high complexity
    VERY_HIGH: 10, // Above this dependency count is classified as very high complexity
  },
  NOTES_LENGTH: {
    MEDIUM: 200, // Above this word count is classified as medium complexity
    HIGH: 500, // Above this word count is classified as high complexity
    VERY_HIGH: 1000, // Above this word count is classified as very high complexity
  },
};

// Task complexity assessment result: Records detailed results of task complexity analysis
export interface TaskComplexityAssessment {
  level: TaskComplexityLevel; // Overall complexity level
  metrics: {
    // Detailed data of various assessment metrics
    descriptionLength: number; // Description length
    dependenciesCount: number; // Dependencies count
    notesLength: number; // Notes length
    hasNotes: boolean; // Whether there are notes
  };
  recommendations: string[]; // List of processing recommendations
}
