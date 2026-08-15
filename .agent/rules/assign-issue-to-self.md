---
trigger: always_on
description: Rule to assign the active GitHub Issue to the agent during evaluation and planning
---

# GitHub Issue Auto-Assignment Rule

Whenever you are given a GitHub Issue to evaluate, plan, or implement:
1. **Assign the issue to yourself** immediately before starting the planning or execution phase.
2. Use the GitHub CLI `gh` to assign it:
   ```bash
   gh issue edit <issue-number> --add-assignee @me
   ```
3. Report that you have assigned the issue to yourself in your response.
