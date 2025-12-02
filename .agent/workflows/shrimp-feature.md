---
description: Standard feature development workflow using Shrimp Task Manager
---
1. **Plan Task**: Call `plan_task` with the user's request to get planning guidance.
2. **Analyze Task**: Call `analyze_task` to perform a deep technical analysis of the requirements.
3. **Reflect on Plan**: Call `reflect_task` to critique the analysis and identify potential pitfalls.
4. **Split Tasks**: Call `split_tasks` to break the feature into atomic, implementable subtasks.
5. **Execute Tasks**:
    - For each task in the list:
        - **Agent Check**: Check the `agent` field of the task. If it specifies a role (e.g., "Frontend", "Backend"), adopt that persona for this task.
        - Call `execute_task` to get the implementation guide.
        - Implement the changes.
        - Call `verify_task` to ensure correctness and **Security Compliance**.
