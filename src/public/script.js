// Global variables
let tasks = [];
let selectedTaskId = null;
let searchTerm = "";
let sortOption = "date-asc";
let globalAnalysisResult = null; // New: Store global analysis result

let svg, g, simulation;
let width, height; // << New: Define width and height as global variables

let isGraphInitialized = false; // << New: Track whether the chart has been initialized

let zoom; // << New: Save zoom behavior object

// New: i18n global variables
let currentLang = "en"; // Default language

let translations = {}; // Store loaded translations

// DOM elements
const taskListElement = document.getElementById("task-list");
const taskDetailsContent = document.getElementById("task-details-content");
const statusFilter = document.getElementById("status-filter");
const currentTimeElement = document.getElementById("current-time");
const progressIndicator = document.getElementById("progress-indicator");
const progressCompleted = document.getElementById("progress-completed");
const progressInProgress = document.getElementById("progress-in-progress");
const progressPending = document.getElementById("progress-pending");
const progressLabels = document.getElementById("progress-labels");
const dependencyGraphElement = document.getElementById("dependency-graph");
const globalAnalysisResultElement = document.getElementById(
  "global-analysis-result"
); // Assuming this element exists in HTML
const langSwitcher = document.getElementById("lang-switcher"); // << New: Get switcher element

const resetViewBtn = document.getElementById("reset-view-btn"); // << New: Get reset button element

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  // fetchTasks(); // Will be triggered by initI18n()
  initI18n(); // << New: Initialize i18n

  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);
  updateDimensions(); // << New: Update dimensions during initialization

  // Event listeners
  // statusFilter.addEventListener("change", renderTasks); // Will be triggered by changeLanguage or after applyTranslations
  if (statusFilter) {
    statusFilter.addEventListener("change", renderTasks);
  }

  // New: Reset view button event listener
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", resetView);
  }

  // New: Search and sorting event listeners
  const searchInput = document.getElementById("search-input");
  const sortOptions = document.getElementById("sort-options");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderTasks();
    });
  }

  if (sortOptions) {
    sortOptions.addEventListener("change", (e) => {
      sortOption = e.target.value;
      renderTasks();
    });
  }

  // New: Setup SSE connection
  setupSSE();

  // New: Language switcher event listener
  if (langSwitcher) {
    langSwitcher.addEventListener("change", (e) =>
      changeLanguage(e.target.value)
    );
  }

  // New: Update dimensions when window size changes
  window.addEventListener("resize", () => {
    updateDimensions();
    if (svg && simulation) {
      svg.attr("viewBox", [0, 0, width, height]);
      simulation.force("center", d3.forceCenter(width / 2, height / 2));
      simulation.alpha(0.3).restart();
    }
  });
});

// New: i18n core functions
// 1. Language detection (Always 'en')
function detectLanguage() {
  return "en";
}

// 2. Asynchronously load translation files
async function loadTranslations(lang) {
  try {
    const response = await fetch(`/locales/${lang}.json`);
    if (!response.ok) {
      throw new Error(
        `Failed to load ${lang}.json, status: ${response.status}`
      );
    }
    translations = await response.json();
    console.log(`Translations loaded for ${lang}`);
  } catch (error) {
    console.error("Error loading translations:", error);
    if (lang !== "en") {
      console.warn(`Falling back to English translations.`);
      await loadTranslations("en"); // Fallback to English
    } else {
      translations = {}; // Clear translations if even English fails
      alert("Critical error: Could not load language files.");
    }
  }
}

// 3. Translation function
function translate(key, replacements = {}) {
  let translated = translations[key] || key; // Fallback to key itself
  // Simple placeholder replacement (e.g., {message})
  for (const placeholder in replacements) {
    translated = translated.replace(
      `{${placeholder}}`,
      replacements[placeholder]
    );
  }
  return translated;
}

// 4. Apply translations to DOM (handle textContent, placeholder, title)
function applyTranslations() {
  console.log("Applying translations for:", currentLang);
  document.querySelectorAll("[data-i18n-key]").forEach((el) => {
    const key = el.dataset.i18nKey;
    const translatedText = translate(key);

    // Handle specific attributes first
    if (el.hasAttribute("placeholder")) {
      el.placeholder = translatedText;
    } else if (el.hasAttribute("title")) {
      el.title = translatedText;
    } else if (el.tagName === "OPTION") {
      el.textContent = translatedText;
    } else {
      // For most elements, set textContent
      el.textContent = translatedText;
    }
  });
}

// 5. Initialize i18n
async function initI18n() {
  currentLang = detectLanguage();
  console.log(`Initializing i18n with language: ${currentLang}`);
  // << New: Set initial value of the switcher >>
  if (langSwitcher) {
    langSwitcher.value = currentLang;
  }
  await loadTranslations(currentLang);
  applyTranslations();
  await fetchTasks();
}

// New: Language switching function
function changeLanguage(lang) {
  if (!lang || lang !== "en") {
    console.warn(`Invalid language selected: ${lang}. Defaulting to English.`);
    lang = "en";
  }
  currentLang = lang;
  console.log(`Changing language to: ${currentLang}`);
  loadTranslations(currentLang)
    .then(() => {
      console.log("Translations reloaded, applying...");
      applyTranslations();
      console.log("Re-rendering components...");
      // Re-render components that need translation
      renderTasks();
      if (selectedTaskId) {
        const task = tasks.find((t) => t.id === selectedTaskId);
        if (task) {
          selectTask(selectedTaskId); // Ensure ID is passed, let selectTask re-find and render
        } else {
          // If selected task no longer exists, clear details
          taskDetailsContent.innerHTML = `<p class="placeholder">${translate(
            "task_details_placeholder"
          )}</p>`;
          selectedTaskId = null;
          highlightNode(null);
        }
      } else {
        // If no task is selected, ensure details panel shows placeholder
        taskDetailsContent.innerHTML = `<p class="placeholder">${translate(
          "task_details_placeholder"
        )}</p>`;
      }
      renderDependencyGraph(); // Re-render graph (may contain placeholder)
      updateProgressIndicator(); // Re-render progress bar (contains labels)
      renderGlobalAnalysisResult(); // Re-render global analysis (title)
      // Ensure dropdown value matches current language
      if (langSwitcher) langSwitcher.value = currentLang;
      console.log("Language change complete.");
    })
    .catch((error) => {
      console.error("Error changing language:", error);
      showTemporaryError("Failed to change language. Please try again."); // Need translation key
    });
}
// --- i18n core functions end ---
// --- i18n core functions end ---

// 獲取任務數據
// Fetch task data
async function fetchTasks() {
  try {
    // 初始載入時顯示 loading (現在使用翻譯)
    // Show loading during initial load (now uses translation)
    if (tasks.length === 0) {
      taskListElement.innerHTML = `<div class="loading">${translate(
        "task_list_loading"
      )}</div>`;
    }

    const response = await fetch("/api/tasks");

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const newTasks = data.tasks || [];

    // 提取全局分析結果 (找第一個非空的)
    // Extract global analysis result (find the first non-empty one)
    let foundAnalysisResult = null;
    for (const task of newTasks) {
      if (task.analysisResult) {
        foundAnalysisResult = task.analysisResult;
        break; // 找到一個就夠了
        // Found one is enough
      }
    }
    // Only update when the found result is different from the currently stored one
    if (foundAnalysisResult !== globalAnalysisResult) {
      globalAnalysisResult = foundAnalysisResult;
      renderGlobalAnalysisResult(); // Update display
    }

    // --- Smart update logic (Preliminary - needs improvement to avoid flickering) ---
    // Simply compare task count or identifiers to decide whether to re-render
    // Ideally should compare content of each task and perform DOM updates
    const tasksChanged = didTasksChange(tasks, newTasks);

    if (tasksChanged) {
      tasks = newTasks; // Update global task list
      console.log("Tasks updated via fetch, re-rendering...");
      renderTasks();
      updateProgressIndicator();
      renderDependencyGraph(); // Update graph
    } else {
      console.log(
        "No significant task changes detected, skipping full re-render."
      );
      // If re-rendering list is not needed, maybe just update progress bar
      updateProgressIndicator();
      // Consider if graph needs update (if status might change)
      // renderDependencyGraph(); // Commented out for now, unless status change is critical
    }

    // *** Remove setTimeout polling ***
    // setTimeout(fetchTasks, 30000);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    // Avoid overwriting existing list unless initial load failed
    if (tasks.length === 0) {
      taskListElement.innerHTML = `<div class="error">${translate(
        "error_loading_tasks",
        { message: error.message }
      )}</div>`;
      if (progressIndicator) progressIndicator.style.display = "none";
      if (dependencyGraphElement)
        dependencyGraphElement.innerHTML = `<div class="error">${translate(
          "error_loading_graph"
        )}</div>`;
    } else {
      showTemporaryError(
        translate("error_updating_tasks", { message: error.message })
      );
    }
  }
}

// New: Setup Server-Sent Events connection
function setupSSE() {
  console.log("Setting up SSE connection to /api/tasks/stream");
  const evtSource = new EventSource("/api/tasks/stream");

  evtSource.onmessage = function (event) {
    console.log("SSE message received:", event.data);
    // Can do more complex judgment based on event.data content, currently just update on any message
  };

  evtSource.addEventListener("update", function (event) {
    console.log("SSE 'update' event received:", event.data);
    // Received update event, re-fetch task list
    fetchTasks();
  });

  evtSource.onerror = function (err) {
    console.error("EventSource failed:", err);
    // Can implement reconnection logic
    evtSource.close(); // Close faulty connection
    // Try to reconnect after a delay
    setTimeout(setupSSE, 5000); // Retry after 5 seconds
  };

  evtSource.onopen = function () {
    console.log("SSE connection opened.");
  };
}

// New: Helper function to compare whether the task list has changed (most comprehensive version)
function didTasksChange(oldTasks, newTasks) {
  if (!oldTasks || !newTasks) return true; // Handle initial load or error states

  if (oldTasks.length !== newTasks.length) {
    console.log("Task length changed.");
    return true; // Length change definitely needs update
  }

  const oldTaskMap = new Map(oldTasks.map((task) => [task.id, task]));
  const newTaskIds = new Set(newTasks.map((task) => task.id)); // For checking removed tasks

  // Check for removed tasks first
  for (const oldTask of oldTasks) {
    if (!newTaskIds.has(oldTask.id)) {
      console.log(`Task removed: ${oldTask.id}`);
      return true;
    }
  }

  // Check for new or modified tasks
  for (const newTask of newTasks) {
    const oldTask = oldTaskMap.get(newTask.id);
    if (!oldTask) {
      console.log(`New task found: ${newTask.id}`);
      return true; // New task ID found
    }

    // Compare relevant fields
    const fieldsToCompare = [
      "name",
      "description",
      "status",
      "notes",
      "implementationGuide",
      "verificationCriteria",
      "summary",
    ];

    for (const field of fieldsToCompare) {
      if (oldTask[field] !== newTask[field]) {
        // Handle null/undefined comparisons carefully if needed
        // e.g., !(oldTask[field] == null && newTask[field] == null) checks if one is null/undefined and the other isn't
        if (
          !(oldTask[field] === null && newTask[field] === null) &&
          !(oldTask[field] === undefined && newTask[field] === undefined)
        ) {
          console.log(`Task ${newTask.id} changed field: ${field}`);
          return true;
        }
      }
    }

    // Compare dependencies (array of strings or objects)
    if (!compareDependencies(oldTask.dependencies, newTask.dependencies)) {
      console.log(`Task ${newTask.id} changed field: dependencies`);
      return true;
    }

    // Compare relatedFiles (array of objects) - simple length check first
    if (!compareRelatedFiles(oldTask.relatedFiles, newTask.relatedFiles)) {
      console.log(`Task ${newTask.id} changed field: relatedFiles`);
      return true;
    }

    // Optional: Compare updatedAt as a final check if other fields seem identical
    if (oldTask.updatedAt?.toString() !== newTask.updatedAt?.toString()) {
      console.log(`Task ${newTask.id} changed field: updatedAt (fallback)`);
      return true;
    }
  }

  return false; // No significant changes detected
}

// Helper function to compare dependency arrays
function compareDependencies(deps1, deps2) {
  const arr1 = deps1 || [];
  const arr2 = deps2 || [];

  if (arr1.length !== arr2.length) return false;

  // Extract IDs whether they are strings or objects {taskId: string}
  const ids1 = new Set(
    arr1.map((dep) =>
      typeof dep === "object" && dep !== null ? dep.taskId : dep
    )
  );
  const ids2 = new Set(
    arr2.map((dep) =>
      typeof dep === "object" && dep !== null ? dep.taskId : dep
    )
  );

  if (ids1.size !== ids2.size) return false; // Different number of unique deps
  for (const id of ids1) {
    if (!ids2.has(id)) return false;
  }
  return true;
}

// Helper function to compare relatedFiles arrays (can be simple or complex)
function compareRelatedFiles(files1, files2) {
  const arr1 = files1 || [];
  const arr2 = files2 || [];

  if (arr1.length !== arr2.length) return false;

  // Simple comparison: check if paths and types are the same in the same order
  // For a more robust check, convert to Sets of strings like `path|type` or do deep object comparison
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i].path !== arr2[i].path || arr1[i].type !== arr2[i].type) {
      return false;
    }
    // Add more field comparisons if needed (description, lines, etc.)
    // if (arr1[i].description !== arr2[i].description) return false;
  }
  return true;
}

// New: Function to display temporary error messages
function showTemporaryError(message) {
  const errorElement = document.createElement("div");
  errorElement.className = "temporary-error";
  errorElement.textContent = message; // Keep message itself
  document.body.appendChild(errorElement);
  setTimeout(() => {
    errorElement.remove();
  }, 3000); // Show for 3 seconds
}

// Render task list - *** Needs further optimization to achieve smart updates ***
function renderTasks() {
  console.log("Rendering tasks..."); // Add log
  const filterValue = statusFilter.value;

  let filteredTasks = tasks;
  if (filterValue !== "all") {
    filteredTasks = filteredTasks.filter((task) => task.status === filterValue);
  }

  if (searchTerm) {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    filteredTasks = filteredTasks.filter(
      (task) =>
        (task.name && task.name.toLowerCase().includes(lowerCaseSearchTerm)) ||
        (task.description &&
          task.description.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }

  // Store the filtered task ID set for graphic rendering
  const filteredTaskIds = new Set(filteredTasks.map(task => task.id));

  filteredTasks.sort((a, b) => {
    switch (sortOption) {
      case "name-asc":
        return (a.name || "").localeCompare(b.name || "");
      case "name-desc":
        return (b.name || "").localeCompare(a.name || "");
      case "status":
        const statusOrder = { pending: 1, in_progress: 2, completed: 3 };
        return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      case "date-asc":
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      case "date-desc":
      default:
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
  });

  // Update graphic visibility status
  updateGraphVisibility(filteredTaskIds);

  // --- Simple and crude replacement (will cause flickering) ---
  // TODO: Implement DOM Diffing or smarter update strategy
  if (filteredTasks.length === 0) {
    taskListElement.innerHTML = `<div class="placeholder">${translate(
      "task_list_empty"
    )}</div>`;
  } else {
    taskListElement.innerHTML = filteredTasks
      .map(
        (task) => `
            <div class="task-item status-${task.status.replace(
          "_",
          "-"
        )}" data-id="${task.id}" onclick="selectTask('${task.id}')">
            <h3>${task.name}</h3>
            <div class="task-meta">
                <span class="task-status status-${task.status.replace(
          "_",
          "-"
        )}">${getStatusText(task.status)}</span>
            </div>
            </div>
        `
      )
      .join("");
  }
  // --- End of simple and crude replacement ---

  // Re-apply selection status
  if (selectedTaskId) {
    const taskExists = tasks.some((t) => t.id === selectedTaskId);
    if (taskExists) {
      const selectedElement = document.querySelector(
        `.task-item[data-id="${selectedTaskId}"]`
      );
      if (selectedElement) {
        selectedElement.classList.add("selected");
      }
    } else {
      // If selected task no longer exists in new list, clear selection
      console.log(
        `Selected task ${selectedTaskId} no longer exists, clearing selection.`
      );
      selectedTaskId = null;
      taskDetailsContent.innerHTML = `<p class="placeholder">${translate(
        "task_details_placeholder"
      )}</p>`;
      highlightNode(null); // Clear graph highlight
    }
  }
}

// New: Function to update graph visibility
function updateGraphVisibility(filteredTaskIds) {
  if (!g) return;

  // Update node styles
  g.select(".nodes")
    .selectAll("g.node-item")
    .style("opacity", d => filteredTaskIds.has(d.id) ? 1 : 0.2)
    .style("filter", d => filteredTaskIds.has(d.id) ? "none" : "grayscale(80%)");

  // Update link styles
  g.select(".links")
    .selectAll("line.link")
    .style("opacity", d => {
      const sourceVisible = filteredTaskIds.has(d.source.id || d.source);
      const targetVisible = filteredTaskIds.has(d.target.id || d.target);
      return (sourceVisible && targetVisible) ? 0.6 : 0.1;
    })
    .style("stroke", d => {
      const sourceVisible = filteredTaskIds.has(d.source.id || d.source);
      const targetVisible = filteredTaskIds.has(d.target.id || d.target);
      return (sourceVisible && targetVisible) ? "#999" : "#ccc";
    });

  // Update node and link styles in minimap
  const minimapContent = svg.select(".minimap-content");

  minimapContent.selectAll(".minimap-node")
    .style("opacity", d => filteredTaskIds.has(d.id) ? 1 : 0.2)
    .style("filter", d => filteredTaskIds.has(d.id) ? "none" : "grayscale(80%)");

  minimapContent.selectAll(".minimap-link")
    .style("opacity", d => {
      const sourceVisible = filteredTaskIds.has(d.source.id || d.source);
      const targetVisible = filteredTaskIds.has(d.target.id || d.target);
      return (sourceVisible && targetVisible) ? 0.6 : 0.1;
    })
    .style("stroke", d => {
      const sourceVisible = filteredTaskIds.has(d.source.id || d.source);
      const targetVisible = filteredTaskIds.has(d.target.id || d.target);
      return (sourceVisible && targetVisible) ? "#999" : "#ccc";
    });
}

// New: Function to move node to view center
function centerNode(nodeId) {
  if (!svg || !g || !simulation) return;

  const node = simulation.nodes().find(n => n.id === nodeId);
  if (!node) return;

  // Get current view transform state
  const transform = d3.zoomTransform(svg.node());

  // Calculate transform needed to center the node
  const scale = transform.k; // 保持当前缩放级别
  const x = width / 2 - node.x * scale;
  const y = height / 2 - node.y * scale;

  // Use transition to move smoothly to new position
  svg.transition()
    .duration(750) // 750ms的过渡时间
    .call(zoom.transform, d3.zoomIdentity
      .translate(x, y)
      .scale(scale)
    );
}

// 修改选择任务的函数
function selectTask(taskId) {
  // 清除旧的选中状态和高亮
  if (selectedTaskId) {
    const previousElement = document.querySelector(
      `.task-item[data-id="${selectedTaskId}"]`
    );
    if (previousElement) {
      previousElement.classList.remove("selected");
    }
  }

  // 如果再次点击同一个任务，则取消选中
  if (selectedTaskId === taskId) {
    selectedTaskId = null;
    taskDetailsContent.innerHTML = `<p class="placeholder">${translate(
      "task_details_placeholder"
    )}</p>`;
    highlightNode(null); // 取消高亮
    return;
  }

  selectedTaskId = taskId;

  // 添加新的选中状态
  const selectedElement = document.querySelector(
    `.task-item[data-id="${taskId}"]`
  );
  if (selectedElement) {
    selectedElement.classList.add("selected");
  }

  // 获取并显示任务详情
  const task = tasks.find((t) => t.id === taskId);

  if (!task) {
    taskDetailsContent.innerHTML = `<div class="placeholder">${translate(
      "error_task_not_found"
    )}</div>`;
    return;
  }

  // --- Safely populate task details ---
  // 1. Create basic skeleton (use innerHTML, but replace dynamic content with empty elements with IDs)
  taskDetailsContent.innerHTML = `
    <div class="task-details-header">
      <h3 id="detail-name"></h3>
      <div class="task-meta">
        <span>${translate(
    "task_detail_status_label"
  )} <span id="detail-status" class="task-status"></span></span>
      </div>
    </div>
    
    <!-- New: Conditionally display Summary -->
    <div class="task-details-section" id="detail-summary-section" style="display: none;">
      <h4>${translate("task_detail_summary_title")}</h4>
      <p id="detail-summary"></p>
    </div>
    
    <div class="task-details-section">
      <h4>${translate("task_detail_description_title")}</h4>
      <p id="detail-description"></p>
    </div>
    
    <div class="task-details-section">
      <h4>${translate("task_detail_implementation_guide_title")}</h4>
      <pre id="detail-implementation-guide"></pre>
    </div>
    
    <div class="task-details-section">
      <h4>${translate("task_detail_verification_criteria_title")}</h4>
      <p id="detail-verification-criteria"></p>
    </div>
    
    <div class="task-details-section">
      <h4>${translate("task_detail_dependencies_title")}</h4>
      <div class="dependencies" id="detail-dependencies">
        <!-- Dependencies will be populated by JS -->
      </div>
    </div>
    
    <div class="task-details-section">
      <h4>${translate("task_detail_related_files_title")}</h4>
      <div class="related-files" id="detail-related-files">
        <!-- Related files will be populated by JS -->
      </div>
    </div>

    <div class="task-details-section">
      <h4>${translate("task_detail_notes_title")}</h4>
      <p id="detail-notes"></p>
    </div>
  `;

  // 2. Get corresponding elements and safely populate content using textContent
  const detailName = document.getElementById("detail-name");
  const detailStatus = document.getElementById("detail-status");
  const detailDescription = document.getElementById("detail-description");
  const detailImplementationGuide = document.getElementById(
    "detail-implementation-guide"
  );
  const detailVerificationCriteria = document.getElementById(
    "detail-verification-criteria"
  );
  // New: Get Summary related elements
  const detailSummarySection = document.getElementById(
    "detail-summary-section"
  );
  const detailSummary = document.getElementById("detail-summary");
  const detailNotes = document.getElementById("detail-notes");
  const detailDependencies = document.getElementById("detail-dependencies");
  const detailRelatedFiles = document.getElementById("detail-related-files");

  if (detailName) detailName.textContent = task.name;
  if (detailStatus) {
    detailStatus.textContent = getStatusText(task.status);
    detailStatus.className = `task-status status-${task.status.replace(
      "_",
      "-"
    )}`;
  }
  if (detailDescription)
    detailDescription.textContent =
      task.description || translate("task_detail_no_description");
  if (detailImplementationGuide)
    detailImplementationGuide.textContent =
      task.implementationGuide ||
      translate("task_detail_no_implementation_guide");
  if (detailVerificationCriteria)
    detailVerificationCriteria.textContent =
      task.verificationCriteria ||
      translate("task_detail_no_verification_criteria");

  // New: Populate Summary (if exists and completed)
  if (task.summary && detailSummarySection && detailSummary) {
    detailSummary.textContent = task.summary;
    detailSummarySection.style.display = "block"; // Show section
  } else if (detailSummarySection) {
    detailSummarySection.style.display = "none"; // Hide section
  }

  if (detailNotes)
    detailNotes.textContent = task.notes || translate("task_detail_no_notes");

  // 3. Dynamically generate dependencies and related files (these can contain safe HTML structures like span)
  if (detailDependencies) {
    const dependenciesHtml =
      task.dependencies && task.dependencies.length
        ? task.dependencies
          .map((dep) => {
            const depId =
              typeof dep === "object" && dep !== null && dep.taskId
                ? dep.taskId
                : dep;
            const depTask = tasks.find((t) => t.id === depId);
            // Translate the fallback text for unknown dependency
            const depName = depTask
              ? depTask.name
              : `${translate("task_detail_unknown_dependency")}(${depId})`;
            const span = document.createElement("span");
            span.className = "dependency-tag";
            span.dataset.id = depId;
            span.textContent = depName;
            span.onclick = () => highlightNode(depId);
            return span.outerHTML;
          })
          .join("")
        : `<span class="placeholder">${translate(
          "task_detail_no_dependencies"
        )}</span>`; // Translate placeholder
    detailDependencies.innerHTML = dependenciesHtml;
  }

  if (detailRelatedFiles) {
    const relatedFilesHtml =
      task.relatedFiles && task.relatedFiles.length
        ? task.relatedFiles
          .map((file) => {
            const span = document.createElement("span");
            span.className = "file-tag";
            span.title = file.description || "";
            const pathText = document.createTextNode(`${file.path} `);
            const small = document.createElement("small");
            small.textContent = `(${file.type})`; // Type is likely technical, maybe no translation needed?
            span.appendChild(pathText);
            span.appendChild(small);
            return span.outerHTML;
          })
          .join("")
        : `<span class="placeholder">${translate(
          "task_detail_no_related_files"
        )}</span>`; // Translate placeholder
    detailRelatedFiles.innerHTML = relatedFilesHtml;
  }

  // --- 原來的 innerHTML 賦值已移除 ---

  // 高亮节点并将其移动到中心
  highlightNode(taskId);
  centerNode(taskId);
}

// 新增：重置視圖功能
function resetView() {
  if (!svg || !simulation) return;

  // 添加重置動畫效果
  resetViewBtn.classList.add("resetting");

  // 計算視圖中心
  const centerX = width / 2;
  const centerY = height / 2;

  // 重置縮放和平移（使用 transform 過渡）
  svg.transition()
    .duration(750)
    .call(zoom.transform, d3.zoomIdentity);

  // 重置所有節點位置到中心附近
  simulation.nodes().forEach(node => {
    node.x = centerX + (Math.random() - 0.5) * 50; // 在中心點附近隨機分佈
    node.y = centerY + (Math.random() - 0.5) * 50;
    node.fx = null; // 清除固定位置
    node.fy = null;
  });

  // 重置力導向模擬
  simulation
    .force("center", d3.forceCenter(centerX, centerY))
    .alpha(1) // 完全重啟模擬
    .restart();

  // 750ms 後移除動畫類
  setTimeout(() => {
    resetViewBtn.classList.remove("resetting");
  }, 750);
}

// 新增：初始化縮放行為
function initZoom() {
  zoom = d3.zoom()
    .scaleExtent([0.1, 4]) // 設置縮放範圍
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
      updateMinimap(); // 在縮放時更新縮略圖
    });

  if (svg) {
    svg.call(zoom);
  }
}

// 渲染依賴關係圖 - 修改為全局視圖和 enter/update/exit 模式
function renderDependencyGraph() {
  if (!dependencyGraphElement || !window.d3) {
    console.warn("D3 or dependency graph element not found.");
    if (dependencyGraphElement) {
      if (!dependencyGraphElement.querySelector("svg")) {
        dependencyGraphElement.innerHTML = `<p class="placeholder">${translate("error_loading_graph_d3")}</p>`;
      }
    }
    return;
  }

  updateDimensions();

  // If no tasks, clear graph and show prompt
  if (tasks.length === 0) {
    dependencyGraphElement.innerHTML = `<p class="placeholder">${translate("dependency_graph_placeholder_empty")}</p>`;
    svg = null;
    g = null;
    simulation = null;
    return;
  }

  // 1. Prepare Nodes and Links
  const nodes = tasks.map((task) => ({
    id: task.id,
    name: task.name,
    status: task.status,
    x: simulation?.nodes().find((n) => n.id === task.id)?.x,
    y: simulation?.nodes().find((n) => n.id === task.id)?.y,
    fx: simulation?.nodes().find((n) => n.id === task.id)?.fx,
    fy: simulation?.nodes().find((n) => n.id === task.id)?.fy,
  }));

  const links = [];
  tasks.forEach((task) => {
    if (task.dependencies && task.dependencies.length > 0) {
      task.dependencies.forEach((dep) => {
        const sourceId = typeof dep === "object" ? dep.taskId : dep;
        const targetId = task.id;
        if (nodes.some((n) => n.id === sourceId) && nodes.some((n) => n.id === targetId)) {
          links.push({ source: sourceId, target: targetId });
        } else {
          console.warn(`Dependency link ignored: Task ${sourceId} or ${targetId} not found in task list.`);
        }
      });
    }
  });

  if (!svg) {
    // --- First render ---
    console.log("First render of dependency graph");
    dependencyGraphElement.innerHTML = "";

    svg = d3.select(dependencyGraphElement)
      .append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Add minimap background
    const minimapSize = Math.min(width, height) * 0.2; // Minimap size is 20% of main view
    const minimapMargin = 40;

    // Create minimap container
    const minimap = svg.append("g")
      .attr("class", "minimap")
      .attr("transform", `translate(${width - minimapSize - minimapMargin}, ${height - minimapSize - minimapMargin * (height / width)})`);

    // Add minimap background
    minimap.append("rect")
      .attr("width", minimapSize)
      .attr("height", minimapSize)
      .attr("fill", "rgba(0, 0, 0, 0.2)")
      .attr("stroke", "#666")
      .attr("stroke-width", 1)
      .attr("rx", 4)
      .attr("ry", 4);

    // Create minimap content group
    minimap.append("g")
      .attr("class", "minimap-content");

    // Add viewport indicator
    minimap.append("rect")
      .attr("class", "minimap-viewport");

    g = svg.append("g");

    // Initialize and add zoom behavior
    initZoom();

    // Add arrow definition
    g.append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");

    // Initialize force simulation
    simulation = d3.forceSimulation()
      .force("link", d3.forceLink().id((d) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(30))
      // New: Horizontal distribution force, used to optimize node distribution in horizontal direction, based on node in-degree and out-degree. Nodes with 0 in-degree (start nodes) are on left, 0 out-degree (end nodes) on right, others in middle.
      .force("x", d3.forceX().x(d => {
        // Calculate node in-degree and out-degree
        const inDegree = links.filter(l => (l.target.id || l.target) === d.id).length;
        const outDegree = links.filter(l => (l.source.id || l.source) === d.id).length;

        if (inDegree === 0) {
          // In-degree 0 (start node) on left
          return width * 0.2;
        } else if (outDegree === 0) {
          // Out-degree 0 (end node) on right
          return width * 0.8;
        } else {
          // Others in middle
          return width * 0.5;
        }
      }).strength(0.2))
      // New: Vertical distribution force based on node degree
      .force("y", d3.forceY().y(height / 2).strength(d => {
        // Calculate total degree (in + out)
        const inDegree = links.filter(l => (l.target.id || l.target) === d.id).length;
        const outDegree = links.filter(l => (l.source.id || l.source) === d.id).length;
        const totalDegree = inDegree + outDegree;

        // Larger degree, larger force (base 0.05, add 0.03 per connection, max 0.3)
        return Math.min(0.05 + totalDegree * 0.03, 0.3);
      }))
      .on("tick", ticked);

    // Add groups for links and nodes
    g.append("g").attr("class", "links");
    g.append("g").attr("class", "nodes");
  } else {
    // --- Update graph render ---
    console.log("Updating dependency graph");
    svg.attr("viewBox", [0, 0, width, height]);
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
  }

  // --- Pre-calculate stable node positions ---
  // Copy nodes and links for stabilization calculation
  const stableNodes = [...nodes];
  const stableLinks = [...links];

  // Temporarily create a simulation to calculate stable positions
  const stableSim = d3
    .forceSimulation(stableNodes)
    .force("link", d3.forceLink(stableLinks).id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(30));

  // Warm up simulation to get stable positions
  for (let i = 0; i < 10; i++) {
    stableSim.tick();
  }

  // Copy stable positions back to original nodes
  stableNodes.forEach((stableNode) => {
    const originalNode = nodes.find(n => n.id === stableNode.id);
    if (originalNode) {
      originalNode.x = stableNode.x;
      originalNode.y = stableNode.y;
    }
  });

  // Stop temporary simulation
  stableSim.stop();
  // --- End of pre-calculation ---

  // 3. Update links (no animation)
  const linkSelection = g
    .select(".links") // Select g element for links
    .selectAll("line.link")
    .data(
      links,
      (d) => `${d.source.id || d.source}-${d.target.id || d.target}`
    ); // Key function based on source/target ID

  // Exit - Remove old links directly
  linkSelection.exit().remove();

  // Enter - Add new links (no animation)
  const linkEnter = linkSelection
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("stroke", "#999")
    .attr("marker-end", "url(#arrowhead)")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", 1.5);

  // Set link positions immediately
  linkEnter
    .attr("x1", d => d.source.x || 0)
    .attr("y1", d => d.source.y || 0)
    .attr("x2", d => d.target.x || 0)
    .attr("y2", d => d.target.y || 0);

  // 4. Update nodes (no animation)
  const nodeSelection = g
    .select(".nodes") // Select g element for nodes
    .selectAll("g.node-item")
    .data(nodes, (d) => d.id); // Use ID as key

  // Exit - Remove old nodes directly
  nodeSelection.exit().remove();

  // Enter - Add new node groups (no animation, create at final position)
  const nodeEnter = nodeSelection
    .enter()
    .append("g")
    .attr("class", (d) => `node-item status-${getStatusClass(d.status)}`) // Use helper function to set class
    .attr("data-id", (d) => d.id)
    // Use pre-calculated positions directly, no zoom or opacity transition
    .attr("transform", (d) => `translate(${d.x || 0}, ${d.y || 0})`)
    .call(drag(simulation)); // Add drag

  // Add circle to Enter selection
  nodeEnter
    .append("circle")
    .attr("r", 10)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .attr("fill", getNodeColor); // Set color directly

  // Add text to Enter selection
  nodeEnter
    .append("text")
    .attr("x", 15)
    .attr("y", 3)
    .text((d) => d.name)
    .attr("font-size", "10px")
    .attr("fill", "#ccc");

  // Add title (tooltip) to Enter selection
  nodeEnter
    .append("title")
    .text((d) => `${d.name} (${getStatusText(d.status)})`);

  // Add click event to Enter selection
  nodeEnter.on("click", (event, d) => {
    selectTask(d.id);
    event.stopPropagation();
  });

  // Update - Update existing nodes immediately (no animation)
  nodeSelection
    .attr("transform", (d) => `translate(${d.x || 0}, ${d.y || 0})`)
    .attr("class", (d) => `node-item status-${getStatusClass(d.status)}`);

  nodeSelection
    .select("circle")
    .attr("fill", getNodeColor);

  // << New: Redefine drag function >>
  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      // Cancel fixed position, let node continue to be affected by force (if needed)
      // d.fx = null;
      // d.fy = null;
      // Or keep fixed position until dragged again
    }

    return d3
      .drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }
  // << End of drag function definition >>

  // 5. Update force simulation, but do not start
  simulation.nodes(nodes); // Update simulation nodes
  simulation.force("link").links(links); // Update simulation links

  // Update target position for horizontal distribution force
  simulation.force("x").x(d => {
    const inDegree = links.filter(l => (l.target.id || l.target) === d.id).length;
    const outDegree = links.filter(l => (l.source.id || l.source) === d.id).length;

    if (inDegree === 0) {
      return width * 0.2;
    } else if (outDegree === 0) {
      return width * 0.8;
    } else {
      return width * 0.5;
    }
  });
  // Note: Removed restart() call to prevent animation jump on refresh
}

// Tick function: Update node and link positions
function ticked() {
  if (!g) return;

  // Update link positions
  g.select(".links")
    .selectAll("line.link")
    .attr("x1", (d) => d.source.x)
    .attr("y1", (d) => d.source.y)
    .attr("x2", (d) => d.target.x)
    .attr("y2", (d) => d.target.y);

  // Update node group positions
  g.select(".nodes")
    .selectAll("g.node-item")
    // << Modify: Add coordinate fallback values >>
    .attr("transform", (d) => `translate(${d.x || 0}, ${d.y || 0})`);

  // Update minimap
  updateMinimap();
}

// Function: Return color based on node data (example)
function getNodeColor(nodeData) {
  switch (nodeData.status) {
    case "已完成":
    case "completed":
      return "var(--secondary-color)";
    case "進行中":
    case "in_progress":
      return "var(--primary-color)";
    case "待處理":
    case "pending":
      return "#f1c40f"; // Consistent with progress bar and status labels
    default:
      return "#7f8c8d"; // Unknown status
  }
}

// Helper functions
function getStatusText(status) {
  switch (status) {
    case "pending":
      return translate("status_pending");
    case "in_progress":
      return translate("status_in_progress");
    case "completed":
      return translate("status_completed");
    default:
      return status;
  }
}

function updateCurrentTime() {
  const now = new Date();
  // Keep original format, use translate or other lib if localized time needed
  const timeString = now.toLocaleString(); // Consider if formatting based on currentLang is needed
  if (currentTimeElement) {
    // Separate static text and dynamic time
    const footerTextElement = currentTimeElement.parentNode.childNodes[0];
    if (footerTextElement && footerTextElement.nodeType === Node.TEXT_NODE) {
      footerTextElement.nodeValue = translate("footer_copyright");
    }
    currentTimeElement.textContent = timeString;
  }
}
// Update project progress indicator
function updateProgressIndicator() {
  const totalTasks = tasks.length;
  if (totalTasks === 0) {
    progressIndicator.style.display = "none"; // Hide when no tasks
    return;
  }

  progressIndicator.style.display = "block"; // Ensure display

  const completedTasks = tasks.filter(
    (task) => task.status === "completed" || task.status === "已完成"
  ).length;
  const inProgressTasks = tasks.filter(
    (task) => task.status === "in_progress" || task.status === "進行中"
  ).length;
  const pendingTasks = tasks.filter(
    (task) => task.status === "pending" || task.status === "待處理"
  ).length;

  const completedPercent =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const inProgressPercent =
    totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0;
  const pendingPercent = totalTasks > 0 ? (pendingTasks / totalTasks) * 100 : 0;

  progressCompleted.style.width = `${completedPercent}%`;
  progressInProgress.style.width = `${inProgressPercent}%`;
  progressPending.style.width = `${pendingPercent}%`;

  // Update labels (use translate)
  progressLabels.innerHTML = `
    <span class="label-completed">${translate(
    "progress_completed"
  )}: ${completedTasks} (${completedPercent.toFixed(1)}%)</span>
    <span class="label-in-progress">${translate(
    "progress_in_progress"
  )}: ${inProgressTasks} (${inProgressPercent.toFixed(1)}%)</span>
    <span class="label-pending">${translate(
    "progress_pending"
  )}: ${pendingTasks} (${pendingPercent.toFixed(1)}%)</span>
    <span class="label-total">${translate(
    "progress_total"
  )}: ${totalTasks}</span>
  `;
}

// New: Render global analysis result
function renderGlobalAnalysisResult() {
  let targetElement = document.getElementById("global-analysis-result");

  // If element does not exist, try to create and add to appropriate position (e.g. before header or main content)
  if (!targetElement) {
    targetElement = document.createElement("div");
    targetElement.id = "global-analysis-result";
    targetElement.className = "global-analysis-section"; // Add style class
    // Try to insert after header or before main
    const header = document.querySelector("header");
    const mainContent = document.querySelector("main");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(targetElement, header.nextSibling);
    } else if (mainContent && mainContent.parentNode) {
      mainContent.parentNode.insertBefore(targetElement, mainContent);
    } else {
      // As a last resort, add to beginning of body
      document.body.insertBefore(targetElement, document.body.firstChild);
    }
  }

  if (globalAnalysisResult) {
    targetElement.innerHTML = `
            <h4 data-i18n-key="global_analysis_title">${translate(
      "global_analysis_title"
    )}</h4> 
            <pre>${globalAnalysisResult}</pre> 
        `;
    targetElement.style.display = "block";
  } else {
    targetElement.style.display = "none"; // Hide if no result
    targetElement.innerHTML = ""; // Clear content
  }
}

// New: Highlight node in dependency graph
function highlightNode(taskId, status = null) {
  if (!g || !window.d3) return;

  // Clear highlight of all nodes
  g.select(".nodes") // Select starting from g
    .selectAll("g.node-item")
    .classed("highlighted", false);

  if (!taskId) return;

  // Highlight selected node
  const selectedNode = g
    .select(".nodes") // Select starting from g
    .select(`g.node-item[data-id="${taskId}"]`);
  if (!selectedNode.empty()) {
    selectedNode.classed("highlighted", true);
    // Optionally bring selected node to front
    // selectedNode.raise();
  }
}

// New: Helper function to get status class (can be placed after ticked function, before or after getNodeColor)
function getStatusClass(status) {
  return status ? status.replace(/_/g, "-") : "unknown"; // Replace all underscores
}

// New: Function to update width and height
function updateDimensions() {
  if (dependencyGraphElement) {
    width = dependencyGraphElement.clientWidth;
    height = dependencyGraphElement.clientHeight || 400;
  }
}

// Add minimap update function
function updateMinimap() {
  if (!svg || !simulation) return;

  const minimapSize = Math.min(width, height) * 0.2;
  const nodes = simulation.nodes();
  const links = simulation.force("link").links();

  // Calculate current graph bounds (add padding)
  const padding = 20; // Add padding
  const xExtent = d3.extent(nodes, d => d.x);
  const yExtent = d3.extent(nodes, d => d.y);
  const graphWidth = (xExtent[1] - xExtent[0]) || width;
  const graphHeight = (yExtent[1] - yExtent[0]) || height;

  // Calculate scale, ensuring padding is considered
  const scale = Math.min(
    minimapSize / (graphWidth + padding * 2),
    minimapSize / (graphHeight + padding * 2)
  ) * 0.9; // 0.9 as safety factor

  // Create scale function, adding padding
  const minimapX = d3.scaleLinear()
    .domain([xExtent[0] - padding, xExtent[1] + padding])
    .range([0, minimapSize]);
  const minimapY = d3.scaleLinear()
    .domain([yExtent[0] - padding, yExtent[1] + padding])
    .range([0, minimapSize]);

  // Update links in minimap
  const minimapContent = svg.select(".minimap-content");
  const minimapLinks = minimapContent.selectAll(".minimap-link")
    .data(links);

  minimapLinks.enter()
    .append("line")
    .attr("class", "minimap-link")
    .merge(minimapLinks)
    .attr("x1", d => minimapX(d.source.x))
    .attr("y1", d => minimapY(d.source.y))
    .attr("x2", d => minimapX(d.target.x))
    .attr("y2", d => minimapY(d.target.y))
    .attr("stroke", "#999")
    .attr("stroke-width", 0.5)
    .attr("stroke-opacity", 0.6);

  minimapLinks.exit().remove();

  // Update nodes in minimap
  const minimapNodes = minimapContent.selectAll(".minimap-node")
    .data(nodes);

  minimapNodes.enter()
    .append("circle")
    .attr("class", "minimap-node")
    .attr("r", 2)
    .merge(minimapNodes)
    .attr("cx", d => minimapX(d.x))
    .attr("cy", d => minimapY(d.y))
    .attr("fill", getNodeColor);

  minimapNodes.exit().remove();

  // Update viewport indicator
  const transform = d3.zoomTransform(svg.node());
  const viewportWidth = width / transform.k;
  const viewportHeight = height / transform.k;
  const viewportX = -transform.x / transform.k;
  const viewportY = -transform.y / transform.k;

  svg.select(".minimap-viewport")
    .attr("x", minimapX(viewportX))
    .attr("y", minimapY(viewportY))
    .attr("width", minimapX(viewportX + viewportWidth) - minimapX(viewportX))
    .attr("height", minimapY(viewportY + viewportHeight) - minimapY(viewportY));
}

// Function: Enable node dragging (unchanged)
// ... drag ...
