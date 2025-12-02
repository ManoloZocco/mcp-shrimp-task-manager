import {
  Task,
  TaskStatus,
  TaskDependency,
  TaskComplexityLevel,
  TaskComplexityThresholds,
  TaskComplexityAssessment,
  RelatedFile,
} from "../types/index.js";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { getDataDir, getTasksFilePath, getMemoryDir } from "../utils/paths.js";

const execAsync = promisify(exec);

// Helper function to get current date/time in server's local timezone
function getLocalDate(): Date {
  return new Date();
}

// Helper function to get ISO string in local timezone format
function getLocalISOString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  // Get timezone offset in hours and minutes
  const offset = -now.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0');
  const offsetSign = offset >= 0 ? '+' : '-';

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

// Git helper functions
async function initGitIfNeeded(dataDir: string): Promise<void> {
  const gitDir = path.join(dataDir, '.git');
  try {
    await fs.access(gitDir);
    // Git already initialized
  } catch {
    // Initialize git repository
    await execAsync(`cd "${dataDir}" && git init`);
    await execAsync(`cd "${dataDir}" && git config user.name "Shrimp Task Manager"`);
    await execAsync(`cd "${dataDir}" && git config user.email "shrimp@task-manager.local"`);

    // Create .gitignore
    const gitignore = `# Temporary files
*.tmp
*.log

# OS files
.DS_Store
Thumbs.db
`;
    await fs.writeFile(path.join(dataDir, '.gitignore'), gitignore);

    // Initial commit
    await execAsync(`cd "${dataDir}" && git add .`);
    await execAsync(`cd "${dataDir}" && git commit -m "Initial commit: Initialize task repository"`);
  }
}

async function commitTaskChanges(dataDir: string, message: string, details?: string): Promise<void> {
  try {
    // Stage the tasks.json file
    await execAsync(`cd "${dataDir}" && git add tasks.json`);

    // Check if there are changes to commit
    const { stdout } = await execAsync(`cd "${dataDir}" && git status --porcelain tasks.json`);

    if (stdout.trim()) {
      // There are changes to commit
      const fullMessage = details ? `${message}\n\n${details}` : message;
      const timestamp = getLocalISOString();
      const commitMessage = `[${timestamp}] ${fullMessage}`;

      await execAsync(`cd "${dataDir}" && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
    }
  } catch (error) {
    console.error('Git commit error:', error);
    // Don't fail the operation if git fails
  }
}

// Ensure getting project data folder path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Data file paths (changed to asynchronous acquisition)
// const DATA_DIR = getDataDir();
// const TASKS_FILE = getTasksFilePath();

// Convert exec to Promise form
const execPromise = promisify(exec);

// Ensure data directory exists
async function ensureDataDir() {
  const DATA_DIR = await getDataDir();
  const TASKS_FILE = await getTasksFilePath();

  try {
    await fs.access(DATA_DIR);
  } catch (error) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  try {
    await fs.access(TASKS_FILE);
  } catch (error) {
    await fs.writeFile(TASKS_FILE, JSON.stringify({ tasks: [] }));
  }
}

// Read all tasks
async function readTasks(): Promise<Task[]> {
  await ensureDataDir();
  const TASKS_FILE = await getTasksFilePath();
  const data = await fs.readFile(TASKS_FILE, "utf-8");
  const tasks = JSON.parse(data).tasks;

  // Convert date strings back to Date objects
  return tasks.map((task: any) => ({
    ...task,
    createdAt: task.createdAt ? new Date(task.createdAt) : getLocalDate(),
    updatedAt: task.updatedAt ? new Date(task.updatedAt) : getLocalDate(),
    completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
  }));
}

// Write all tasks
async function writeTasks(tasks: Task[], commitMessage?: string): Promise<void> {
  await ensureDataDir();
  const TASKS_FILE = await getTasksFilePath();
  const DATA_DIR = await getDataDir();

  // Initialize git if needed
  await initGitIfNeeded(DATA_DIR);

  // Write the tasks file
  await fs.writeFile(TASKS_FILE, JSON.stringify({ tasks }, null, 2));

  // Commit the changes
  if (commitMessage) {
    await commitTaskChanges(DATA_DIR, commitMessage);
  }
}

// Get all tasks
export async function getAllTasks(): Promise<Task[]> {
  return await readTasks();
}

// Get task by ID
export async function getTaskById(taskId: string): Promise<Task | null> {
  const tasks = await readTasks();
  return tasks.find((task) => task.id === taskId) || null;
}

// Create new task
export async function createTask(
  name: string,
  description: string,
  notes?: string,
  dependencies: string[] = [],
  relatedFiles?: RelatedFile[],
  agent?: string
): Promise<Task> {
  const tasks = await readTasks();

  const dependencyObjects: TaskDependency[] = dependencies.map((taskId) => ({
    taskId,
  }));

  const newTask: Task = {
    id: uuidv4(),
    name,
    description,
    notes,
    status: TaskStatus.PENDING,
    dependencies: dependencyObjects,
    createdAt: getLocalDate(),
    updatedAt: getLocalDate(),
    relatedFiles,
    agent,
  };

  tasks.push(newTask);
  await writeTasks(tasks, `Add new task: ${newTask.name}`);

  return newTask;
}

// Update task
export async function updateTask(
  taskId: string,
  updates: Partial<Task>
): Promise<Task | null> {
  const tasks = await readTasks();
  const taskIndex = tasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    return null;
  }

  // Check if task is completed, completed tasks cannot be updated (unless explicitly allowed fields)
  if (tasks[taskIndex].status === TaskStatus.COMPLETED) {
    // Only allow updating summary field (task summary) and relatedFiles field
    const allowedFields = ["summary", "relatedFiles"];
    const attemptedFields = Object.keys(updates);

    const disallowedFields = attemptedFields.filter(
      (field) => !allowedFields.includes(field)
    );

    if (disallowedFields.length > 0) {
      return null;
    }
  }

  tasks[taskIndex] = {
    ...tasks[taskIndex],
    ...updates,
    updatedAt: getLocalDate(),
  };

  await writeTasks(tasks, `Update task: ${tasks[taskIndex].name}`);

  return tasks[taskIndex];
}

// Update task status
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<Task | null> {
  const updates: Partial<Task> = { status };

  if (status === TaskStatus.COMPLETED) {
    updates.completedAt = getLocalDate();
  }

  return await updateTask(taskId, updates);
}

// Update task summary
export async function updateTaskSummary(
  taskId: string,
  summary: string
): Promise<Task | null> {
  return await updateTask(taskId, { summary });
}

// Update task content
export async function updateTaskContent(
  taskId: string,
  updates: {
    name?: string;
    description?: string;
    notes?: string;
    relatedFiles?: RelatedFile[];
    dependencies?: string[];
    implementationGuide?: string;
    verificationCriteria?: string;
    agent?: string;
  }
): Promise<{ success: boolean; message: string; task?: Task }> {
  // Get task and check if it exists
  const task = await getTaskById(taskId);

  if (!task) {
    return { success: false, message: "Task not found" };
  }

  // Check if task is completed
  if (task.status === TaskStatus.COMPLETED) {
    return { success: false, message: "Cannot update completed task" };
  }

  // Build update object, only including fields that actually need updating
  const updateObj: Partial<Task> = {};

  if (updates.name !== undefined) {
    updateObj.name = updates.name;
  }

  if (updates.description !== undefined) {
    updateObj.description = updates.description;
  }

  if (updates.notes !== undefined) {
    updateObj.notes = updates.notes;
  }

  if (updates.relatedFiles !== undefined) {
    updateObj.relatedFiles = updates.relatedFiles;
  }

  if (updates.dependencies !== undefined) {
    updateObj.dependencies = updates.dependencies.map((dep) => ({
      taskId: dep,
    }));
  }

  if (updates.implementationGuide !== undefined) {
    updateObj.implementationGuide = updates.implementationGuide;
  }

  if (updates.verificationCriteria !== undefined) {
    updateObj.verificationCriteria = updates.verificationCriteria;
  }

  if (updates.agent !== undefined) {
    updateObj.agent = updates.agent;
  }

  // If there is no content to update, return early
  if (Object.keys(updateObj).length === 0) {
    return { success: true, message: "No content to update", task };
  }

  // Execute update
  const updatedTask = await updateTask(taskId, updateObj);

  if (!updatedTask) {
    return { success: false, message: "Error occurred while updating task" };
  }

  return {
    success: true,
    message: "Task content successfully updated",
    task: updatedTask,
  };
}

// Update task related files
export async function updateTaskRelatedFiles(
  taskId: string,
  relatedFiles: RelatedFile[]
): Promise<{ success: boolean; message: string; task?: Task }> {
  // Get task and check if it exists
  const task = await getTaskById(taskId);

  if (!task) {
    return { success: false, message: "Task not found" };
  }

  // Check if task is completed
  if (task.status === TaskStatus.COMPLETED) {
    return { success: false, message: "Cannot update completed task" };
  }

  // Execute update
  const updatedTask = await updateTask(taskId, { relatedFiles });

  if (!updatedTask) {
    return { success: false, message: "Error occurred while updating task related files" };
  }

  return {
    success: true,
    message: `Successfully updated task related files, total ${relatedFiles.length} files`,
    task: updatedTask,
  };
}

// Batch create or update tasks
export async function batchCreateOrUpdateTasks(
  taskDataList: Array<{
    name: string;
    description: string;
    notes?: string;
    dependencies?: string[];
    relatedFiles?: RelatedFile[];
    implementationGuide?: string; // New: Implementation guide
    verificationCriteria?: string; // New: Verification criteria
    agent?: string; // New: Agent assignment
  }>,
  updateMode: "append" | "overwrite" | "selective" | "clearAllTasks", // Required parameter, specifies task update strategy
  globalAnalysisResult?: string // New: Global analysis result
): Promise<Task[]> {
  // Read all existing tasks
  const existingTasks = await readTasks();

  // Handle existing tasks based on update mode
  let tasksToKeep: Task[] = [];

  if (updateMode === "append") {
    // Append mode: Keep all existing tasks
    tasksToKeep = [...existingTasks];
  } else if (updateMode === "overwrite") {
    // Overwrite mode: Keep only completed tasks, clear all incomplete tasks
    tasksToKeep = existingTasks.filter(
      (task) => task.status === TaskStatus.COMPLETED
    );
  } else if (updateMode === "selective") {
    // Selective update mode: Selectively update based on task name, keep tasks not in update list
    // 1. Extract list of task names to update
    const updateTaskNames = new Set(taskDataList.map((task) => task.name));

    // 2. Keep all tasks that do not appear in the update list
    tasksToKeep = existingTasks.filter(
      (task) => !updateTaskNames.has(task.name)
    );
  } else if (updateMode === "clearAllTasks") {
    // Clear all tasks
    // Clear all tasks mode: Clear task list
    tasksToKeep = [];
  }

  // This map will be used to store name to task ID mapping, to support referencing tasks by name
  const taskNameToIdMap = new Map<string, string>();

  // For selective update mode, record existing task names and IDs first
  if (updateMode === "selective") {
    existingTasks.forEach((task) => {
      taskNameToIdMap.set(task.name, task.id);
    });
  }

  // Record all task names and IDs, whether kept or new
  // This will be used later to resolve dependencies
  tasksToKeep.forEach((task) => {
    taskNameToIdMap.set(task.name, task.id);
  });

  // Create new tasks
  // List of new tasks
  // Create list of new tasks
  const newTasks: Task[] = [];

  for (const taskData of taskDataList) {
    // Check if it is selective update mode and the task name already exists
    if (updateMode === "selective" && taskNameToIdMap.has(taskData.name)) {
      // Get the ID of the existing task
      const existingTaskId = taskNameToIdMap.get(taskData.name)!;

      // Find existing task
      const existingTaskIndex = existingTasks.findIndex(
        (task) => task.id === existingTaskId
      );

      // If existing task is found and not completed, update it
      if (
        existingTaskIndex !== -1 &&
        existingTasks[existingTaskIndex].status !== TaskStatus.COMPLETED
      ) {
        const taskToUpdate = existingTasks[existingTaskIndex];

        // Update task
        // Update basic task information, but preserve original ID, creation time, etc.
        const updatedTask: Task = {
          ...taskToUpdate,
          name: taskData.name,
          description: taskData.description,
          notes: taskData.notes,
          // Dependencies will be processed later
          updatedAt: getLocalDate(),
          // New: Save implementation guide (if any)
          implementationGuide: taskData.implementationGuide,
          // New: Save verification criteria (if any)
          verificationCriteria: taskData.verificationCriteria,
          // New: Save global analysis result (if any)
          analysisResult: globalAnalysisResult,
          // New: Save agent assignment (if any)
          agent: taskData.agent,
        };

        // Process related files (if any)
        if (taskData.relatedFiles) {
          updatedTask.relatedFiles = taskData.relatedFiles;
        }

        // Add updated task to new task list
        newTasks.push(updatedTask);

        // Remove this task from tasksToKeep because it has been updated and added to newTasks
        tasksToKeep = tasksToKeep.filter((task) => task.id !== existingTaskId);
      }
    } else {
      // Create new task
      // Create new task
      const newTaskId = uuidv4();

      // Add new task name and ID to mapping
      taskNameToIdMap.set(taskData.name, newTaskId);

      const newTask: Task = {
        id: newTaskId,
        name: taskData.name,
        description: taskData.description,
        notes: taskData.notes,
        status: TaskStatus.PENDING,
        dependencies: [], // Will be filled later
        createdAt: getLocalDate(),
        updatedAt: getLocalDate(),
        relatedFiles: taskData.relatedFiles,
        // New: Save implementation guide (if any)
        implementationGuide: taskData.implementationGuide,
        // New: Save verification criteria (if any)
        verificationCriteria: taskData.verificationCriteria,
        // New: Save global analysis result (if any)
        analysisResult: globalAnalysisResult,
        // New: Save agent assignment (if any)
        agent: taskData.agent,
      };

      newTasks.push(newTask);
    }
  }

  // Handle dependencies between tasks
  for (let i = 0; i < taskDataList.length; i++) {
    const taskData = taskDataList[i];
    const newTask = newTasks[i];

    // If dependencies exist, process them
    if (taskData.dependencies && taskData.dependencies.length > 0) {
      const resolvedDependencies: TaskDependency[] = [];

      for (const dependencyName of taskData.dependencies) {
        // First try to interpret dependency as task ID
        let dependencyTaskId = dependencyName;

        // If dependency does not look like UUID, try to interpret it as task name
        if (
          !dependencyName.match(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          )
        ) {
          // If this name exists in mapping, use corresponding ID
          if (taskNameToIdMap.has(dependencyName)) {
            dependencyTaskId = taskNameToIdMap.get(dependencyName)!;
          } else {
            continue; // Skip this dependency
          }
        } else {
          // Is UUID format, but need to confirm if this ID corresponds to an actually existing task
          const idExists = [...tasksToKeep, ...newTasks].some(
            (task) => task.id === dependencyTaskId
          );
          if (!idExists) {
            continue; // Skip this dependency
          }
        }

        resolvedDependencies.push({ taskId: dependencyTaskId });
      }

      newTask.dependencies = resolvedDependencies;
    }
  }

  // Merge kept tasks and new tasks
  const allTasks = [...tasksToKeep, ...newTasks];

  // Write updated task list
  await writeTasks(allTasks, `Bulk task operation: ${updateMode} mode, ${newTasks.length} tasks`);

  return newTasks;
}

// Check if task can be executed (all dependencies completed)
export async function canExecuteTask(
  taskId: string
): Promise<{ canExecute: boolean; blockedBy?: string[] }> {
  const task = await getTaskById(taskId);

  if (!task) {
    return { canExecute: false };
  }

  if (task.status === TaskStatus.COMPLETED) {
    return { canExecute: false }; // Completed tasks do not need to be executed again
  }

  if (task.dependencies.length === 0) {
    return { canExecute: true }; // Tasks without dependencies can be executed directly
  }

  const allTasks = await readTasks();
  const blockedBy: string[] = [];

  for (const dependency of task.dependencies) {
    const dependencyTask = allTasks.find((t) => t.id === dependency.taskId);

    if (!dependencyTask || dependencyTask.status !== TaskStatus.COMPLETED) {
      blockedBy.push(dependency.taskId);
    }
  }

  return {
    canExecute: blockedBy.length === 0,
    blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
  };
}

// Delete task
export async function deleteTask(
  taskId: string
): Promise<{ success: boolean; message: string }> {
  const tasks = await readTasks();
  const taskIndex = tasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    return { success: false, message: "Task not found" };
  }

  // Check task status, completed tasks cannot be deleted
  if (tasks[taskIndex].status === TaskStatus.COMPLETED) {
    return { success: false, message: "Cannot delete completed task" };
  }

  // Check if other tasks depend on this task
  const allTasks = tasks.filter((_, index) => index !== taskIndex);
  const dependentTasks = allTasks.filter((task) =>
    task.dependencies.some((dep) => dep.taskId === taskId)
  );

  if (dependentTasks.length > 0) {
    const dependentTaskNames = dependentTasks
      .map((task) => `"${task.name}" (ID: ${task.id})`)
      .join(", ");
    return {
      success: false,
      message: `Cannot delete this task because the following tasks depend on it: ${dependentTaskNames}`,
    };
  }

  // Execute delete operation
  const deletedTask = tasks[taskIndex];
  tasks.splice(taskIndex, 1);
  await writeTasks(tasks, `Delete task: ${deletedTask.name}`);

  return { success: true, message: "Task deleted successfully" };
}

// Assess task complexity
export async function assessTaskComplexity(
  taskId: string
): Promise<TaskComplexityAssessment | null> {
  const task = await getTaskById(taskId);

  if (!task) {
    return null;
  }

  // Assess various indicators
  const descriptionLength = task.description.length;
  const dependenciesCount = task.dependencies.length;
  const notesLength = task.notes ? task.notes.length : 0;
  const hasNotes = !!task.notes;

  // Assess complexity level based on various indicators
  let level = TaskComplexityLevel.LOW;

  // Description length assessment
  if (
    descriptionLength >= TaskComplexityThresholds.DESCRIPTION_LENGTH.VERY_HIGH
  ) {
    level = TaskComplexityLevel.VERY_HIGH;
  } else if (
    descriptionLength >= TaskComplexityThresholds.DESCRIPTION_LENGTH.HIGH
  ) {
    level = TaskComplexityLevel.HIGH;
  } else if (
    descriptionLength >= TaskComplexityThresholds.DESCRIPTION_LENGTH.MEDIUM
  ) {
    level = TaskComplexityLevel.MEDIUM;
  }

  // Dependencies count assessment (take highest level)
  if (
    dependenciesCount >= TaskComplexityThresholds.DEPENDENCIES_COUNT.VERY_HIGH
  ) {
    level = TaskComplexityLevel.VERY_HIGH;
  } else if (
    dependenciesCount >= TaskComplexityThresholds.DEPENDENCIES_COUNT.HIGH &&
    level !== TaskComplexityLevel.VERY_HIGH
  ) {
    level = TaskComplexityLevel.HIGH;
  } else if (
    dependenciesCount >= TaskComplexityThresholds.DEPENDENCIES_COUNT.MEDIUM &&
    level !== TaskComplexityLevel.HIGH &&
    level !== TaskComplexityLevel.VERY_HIGH
  ) {
    level = TaskComplexityLevel.MEDIUM;
  }

  // Notes length assessment (take highest level)
  if (notesLength >= TaskComplexityThresholds.NOTES_LENGTH.VERY_HIGH) {
    level = TaskComplexityLevel.VERY_HIGH;
  } else if (
    notesLength >= TaskComplexityThresholds.NOTES_LENGTH.HIGH &&
    level !== TaskComplexityLevel.VERY_HIGH
  ) {
    level = TaskComplexityLevel.HIGH;
  } else if (
    notesLength >= TaskComplexityThresholds.NOTES_LENGTH.MEDIUM &&
    level !== TaskComplexityLevel.HIGH &&
    level !== TaskComplexityLevel.VERY_HIGH
  ) {
    level = TaskComplexityLevel.MEDIUM;
  }

  // Generate processing suggestions based on complexity level
  const recommendations: string[] = [];

  // Low complexity task suggestions
  if (level === TaskComplexityLevel.LOW) {
    recommendations.push("This task has low complexity and can be executed directly");
    recommendations.push("It is recommended to set clear completion criteria to ensure acceptance has a clear basis");
  }
  // Medium complexity task suggestions
  else if (level === TaskComplexityLevel.MEDIUM) {
    recommendations.push("This task has some complexity, it is recommended to plan execution steps in detail");
    recommendations.push("Can be executed in stages and progress checked regularly to ensure accurate understanding and complete implementation");
    if (dependenciesCount > 0) {
      recommendations.push("Pay attention to checking the completion status and output quality of all dependent tasks");
    }
  }
  // High complexity task suggestions
  else if (level === TaskComplexityLevel.HIGH) {
    recommendations.push("This task has high complexity, it is recommended to conduct sufficient analysis and planning first");
    recommendations.push("Consider splitting the task into smaller, independently executable subtasks");
    recommendations.push("Establish clear milestones and checkpoints to facilitate tracking progress and quality");
    if (
      dependenciesCount > TaskComplexityThresholds.DEPENDENCIES_COUNT.MEDIUM
    ) {
      recommendations.push(
        "There are many dependent tasks. It is recommended to create a dependency diagram to ensure the correct execution order"
      );
    }
  }
  // Very high complexity task suggestions
  else if (level === TaskComplexityLevel.VERY_HIGH) {
    recommendations.push("⚠️ This task is extremely complex. It is strongly recommended to split it into multiple independent tasks");
    recommendations.push(
      "Conduct detailed analysis and planning before execution, clearly defining the scope and interface of each subtask"
    );
    recommendations.push(
      "Conduct risk assessment for the task, identify possible obstacles and formulate response strategies"
    );
    recommendations.push("Establish specific testing and verification standards to ensure the output quality of each subtask");
    if (
      descriptionLength >= TaskComplexityThresholds.DESCRIPTION_LENGTH.VERY_HIGH
    ) {
      recommendations.push(
        "The task description is very long. It is recommended to organize key points and create a structured execution list"
      );
    }
    if (dependenciesCount >= TaskComplexityThresholds.DEPENDENCIES_COUNT.HIGH) {
      recommendations.push(
        "There are too many dependent tasks. It is recommended to re-evaluate task boundaries to ensure reasonable task division"
      );
    }
  }

  return {
    level,
    metrics: {
      descriptionLength,
      dependenciesCount,
      notesLength,
      hasNotes,
    },
    recommendations,
  };
}

// Clear all tasks
export async function clearAllTasks(): Promise<{
  success: boolean;
  message: string;
  backupFile?: string;
}> {
  try {
    // Ensure data directory exists
    await ensureDataDir();

    // Read existing tasks
    const allTasks = await readTasks();

    // If no tasks, return directly
    if (allTasks.length === 0) {
      return { success: true, message: "No tasks to clear" };
    }

    // Filter out completed tasks
    const completedTasks = allTasks.filter(
      (task) => task.status === TaskStatus.COMPLETED
    );

    // Create backup file name
    const timestamp = getLocalISOString()
      .replace(/:/g, "-")
      .replace(/\..+/, "")
      .replace(/[+\-]\d{2}-\d{2}$/, ""); // Remove timezone offset for filename
    const backupFileName = `tasks_memory_${timestamp}.json`;

    // Ensure memory directory exists
    const MEMORY_DIR = await getMemoryDir();
    try {
      await fs.access(MEMORY_DIR);
    } catch (error) {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
    }

    // Create backup path under memory directory
    const memoryFilePath = path.join(MEMORY_DIR, backupFileName);

    // Also write to memory directory (only containing completed tasks)
    await fs.writeFile(
      memoryFilePath,
      JSON.stringify({ tasks: completedTasks }, null, 2)
    );

    // Clear task file
    await writeTasks([], `Clear all tasks (${allTasks.length} tasks removed)`);

    return {
      success: true,
      message: `Successfully cleared all tasks. ${allTasks.length} tasks removed. ${completedTasks.length} completed tasks backed up to memory directory`,
      backupFile: backupFileName,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error occurred while clearing tasks: ${error instanceof Error ? error.message : String(error)
        }`,
    };
  }
}

// Use system command to search task memory
export async function searchTasksWithCommand(
  query: string,
  isId: boolean = false,
  page: number = 1,
  pageSize: number = 5
): Promise<{
  tasks: Task[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    hasMore: boolean;
  };
}> {
  // Read tasks from current task file
  const currentTasks = await readTasks();
  let memoryTasks: Task[] = [];

  // Search tasks in memory folder
  const MEMORY_DIR = await getMemoryDir();

  try {
    // Ensure memory folder exists
    await fs.access(MEMORY_DIR);

    // Generate search command
    const cmd = generateSearchCommand(query, isId, MEMORY_DIR);

    // If there is a search command, execute it
    if (cmd) {
      try {
        const { stdout } = await execPromise(cmd, {
          maxBuffer: 1024 * 1024 * 10,
        });

        if (stdout) {
          // Parse search results, extract matching file paths
          const matchedFiles = new Set<string>();

          stdout.split("\n").forEach((line) => {
            if (line.trim()) {
              // Format is usually: file path:matching content
              const filePath = line.split(":")[0];
              if (filePath) {
                matchedFiles.add(filePath);
              }
            }
          });

          // Limit number of files to read
          const MAX_FILES_TO_READ = 10;
          const sortedFiles = Array.from(matchedFiles)
            .sort()
            .reverse()
            .slice(0, MAX_FILES_TO_READ);

          // Only process files that meet criteria
          for (const filePath of sortedFiles) {
            try {
              const data = await fs.readFile(filePath, "utf-8");
              const tasks = JSON.parse(data).tasks || [];

              // Format date fields
              const formattedTasks = tasks.map((task: any) => ({
                ...task,
                createdAt: task.createdAt
                  ? new Date(task.createdAt)
                  : getLocalDate(),
                updatedAt: task.updatedAt
                  ? new Date(task.updatedAt)
                  : getLocalDate(),
                completedAt: task.completedAt
                  ? new Date(task.completedAt)
                  : undefined,
              }));

              // Further filter tasks to ensure criteria are met
              const filteredTasks = isId
                ? formattedTasks.filter((task: Task) => task.id === query)
                : formattedTasks.filter((task: Task) => {
                  const keywords = query
                    .split(/\s+/)
                    .filter((k) => k.length > 0);
                  if (keywords.length === 0) return true;

                  return keywords.every((keyword) => {
                    const lowerKeyword = keyword.toLowerCase();
                    return (
                      task.name.toLowerCase().includes(lowerKeyword) ||
                      task.description.toLowerCase().includes(lowerKeyword) ||
                      (task.notes &&
                        task.notes.toLowerCase().includes(lowerKeyword)) ||
                      (task.implementationGuide &&
                        task.implementationGuide
                          .toLowerCase()
                          .includes(lowerKeyword)) ||
                      (task.summary &&
                        task.summary.toLowerCase().includes(lowerKeyword))
                    );
                  });
                });

              memoryTasks.push(...filteredTasks);
            } catch (error: unknown) { }
          }
        }
      } catch (error: unknown) { }
    }
  } catch (error: unknown) { }

  // Filter qualifying tasks from current tasks
  const filteredCurrentTasks = filterCurrentTasks(currentTasks, query, isId);

  // Merge results and deduplicate
  const taskMap = new Map<string, Task>();

  // Current tasks have priority
  filteredCurrentTasks.forEach((task) => {
    taskMap.set(task.id, task);
  });

  // Add memory tasks, avoiding duplicates
  memoryTasks.forEach((task) => {
    if (!taskMap.has(task.id)) {
      taskMap.set(task.id, task);
    }
  });

  // Merged results
  const allTasks = Array.from(taskMap.values());

  // Sort - by update or completion time in descending order
  allTasks.sort((a, b) => {
    // Sort by completion time first
    if (a.completedAt && b.completedAt) {
      return b.completedAt.getTime() - a.completedAt.getTime();
    } else if (a.completedAt) {
      return -1; // a is completed but b is not, a comes first
    } else if (b.completedAt) {
      return 1; // b is completed but a is not, b comes first
    }

    // Otherwise sort by update time
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  // Pagination processing
  const totalResults = allTasks.length;
  const totalPages = Math.ceil(totalResults / pageSize);
  const safePage = Math.max(1, Math.min(page, totalPages || 1)); // Ensure page number is valid
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalResults);
  const paginatedTasks = allTasks.slice(startIndex, endIndex);

  return {
    tasks: paginatedTasks,
    pagination: {
      currentPage: safePage,
      totalPages: totalPages || 1,
      totalResults,
      hasMore: safePage < totalPages,
    },
  };
}

// Generate appropriate search command based on platform
function generateSearchCommand(
  query: string,
  isId: boolean,
  memoryDir: string
): string {
  // Safely escape user input
  const safeQuery = escapeShellArg(query);
  const keywords = safeQuery.split(/\s+/).filter((k) => k.length > 0);

  // Detect operating system type
  const isWindows = process.platform === "win32";

  if (isWindows) {
    // Windows environment, use findstr command
    if (isId) {
      // ID search
      return `findstr /s /i /c:"${safeQuery}" "${memoryDir}\\*.json"`;
    } else if (keywords.length === 1) {
      // Single keyword
      return `findstr /s /i /c:"${safeQuery}" "${memoryDir}\\*.json"`;
    } else {
      // Multi-keyword search - use PowerShell in Windows
      const keywordPatterns = keywords.map((k) => `'${k}'`).join(" -and ");
      return `powershell -Command "Get-ChildItem -Path '${memoryDir}' -Filter *.json -Recurse | Select-String -Pattern ${keywordPatterns} | ForEach-Object { $_.Path }"`;
    }
  } else {
    // Unix/Linux/MacOS environment, use grep command
    if (isId) {
      return `grep -r --include="*.json" "${safeQuery}" "${memoryDir}"`;
    } else if (keywords.length === 1) {
      return `grep -r --include="*.json" "${safeQuery}" "${memoryDir}"`;
    } else {
      // Multi-keyword using pipe to connect multiple grep commands
      const firstKeyword = escapeShellArg(keywords[0]);
      const otherKeywords = keywords.slice(1).map((k) => escapeShellArg(k));

      let cmd = `grep -r --include="*.json" "${firstKeyword}" "${memoryDir}"`;
      for (const keyword of otherKeywords) {
        cmd += ` | grep "${keyword}"`;
      }
      return cmd;
    }
  }
}

/**
 * Safely escape shell arguments to prevent command injection
 */
function escapeShellArg(arg: string): string {
  if (!arg) return "";

  // Remove all control characters and special characters
  return arg
    .replace(/[\x00-\x1F\x7F]/g, "") // Control characters
    .replace(/[&;`$"'<>|]/g, ""); // Shell special characters
}

// Filter current task list
function filterCurrentTasks(
  tasks: Task[],
  query: string,
  isId: boolean
): Task[] {
  if (isId) {
    return tasks.filter((task) => task.id === query);
  } else {
    const keywords = query.split(/\s+/).filter((k) => k.length > 0);
    if (keywords.length === 0) return tasks;

    return tasks.filter((task) => {
      return keywords.every((keyword) => {
        const lowerKeyword = keyword.toLowerCase();
        return (
          task.name.toLowerCase().includes(lowerKeyword) ||
          task.description.toLowerCase().includes(lowerKeyword) ||
          (task.notes && task.notes.toLowerCase().includes(lowerKeyword)) ||
          (task.implementationGuide &&
            task.implementationGuide.toLowerCase().includes(lowerKeyword)) ||
          (task.summary && task.summary.toLowerCase().includes(lowerKeyword))
        );
      });
    });
  }
}
