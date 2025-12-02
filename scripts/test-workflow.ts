import {
    planTask,
    analyzeTask,
    splitTasksRaw,
    executeTask,
    verifyTask,
    initProjectRules,
    listTasks
} from "../src/tools/index.ts";

async function runTest() {
    console.log("--- Starting Workflow Test ---");

    // 0. Init Project Rules
    console.log("\n[0] Initializing Project Rules...");
    await initProjectRules();

    const userRequest = "Add a 'Clear All Completed Tasks' button to the UI and API.";

    // 1. Plan Task
    console.log("\n[1] Planning Task...");
    const planResult = await planTask({
        description: userRequest,
        existingTasksReference: false
    });
    console.log("Plan Result:", planResult.content[0].text.substring(0, 100) + "...");

    // 2. Analyze Task
    console.log("\n[2] Analyzing Task...");
    const analyzeResult = await analyzeTask({
        summary: userRequest,
        initialConcept: "Add button to UI and endpoint to API"
    });
    console.log("Analyze Result:", analyzeResult.content[0].text.substring(0, 100) + "...");

    // 3. Split Tasks (Actually create a task)
    console.log("\n[3] Splitting Tasks...");
    const splitResult = await splitTasksRaw({
        tasksRaw: "- [ ] Implement Clear Completed API",
        updateMode: "append"
    });
    console.log("Split Result:", splitResult.content[0].text.substring(0, 100) + "...");

    // 3.5 List Tasks to get ID
    console.log("\n[3.5] Listing Tasks to find ID...");
    const listResult = await listTasks({});
    const listOutput = listResult.content[0].text;
    const match = listOutput.match(/ID: ([a-f0-9-]{36}) - Implement Clear Completed API/);

    if (!match) {
        console.error("Could not find created task ID in list output.");
        console.log("List Output:", listOutput);
        return;
    }

    const taskId = match[1];
    console.log(`Found Task ID: ${taskId}`);

    // 4. Execute Task
    console.log("\n[4] Executing Task...");
    const executeResult = await executeTask({
        taskId: taskId
    });
    console.log("Execute Result:", executeResult.content[0].text.substring(0, 100) + "...");

    // 5. Verify Task
    console.log("\n[5] Verifying Task...");
    const verifyResult = await verifyTask({
        taskId: taskId,
        summary: "Implemented the API endpoint and verified it works correctly. Security check passed.",
        score: 90
    });
    console.log("Verify Result:", verifyResult.content[0].text.substring(0, 100) + "...");

    console.log("\n--- Workflow Test Completed ---");
}

runTest().catch(console.error);
