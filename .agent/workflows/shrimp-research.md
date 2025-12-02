---
description: Research workflow for complex topics or technology selection
---
1. **Initialize Research**: Call `research_mode` with the topic.
2. **Plan Research**: Call `plan_task` with `existingTasksReference=true` to incorporate research context.
3. **Analyze**: Call `analyze_task` to structure the research findings.
4. **Split Tasks**: Call `split_tasks` to create research subtasks (e.g., "Compare A vs B", "Prototype X").
5. **Execute**: Run the research tasks.
