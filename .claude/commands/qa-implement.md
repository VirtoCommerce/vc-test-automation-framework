# QA Implement

**Stage 2 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the implementation stage. Spawn the `qa-automation-expert` agent to implement one approved
contract. The agent receives the contract path and nothing else.

## Input

`$ARGUMENTS` is the path of a contract: `.qa/contracts/<ticket-key-or-slug>.md`, written by `/qa-plan`.

- No path: ask the person for it, or tell them to run `/qa-plan` first. Do not look for a plan in the conversation
  and do not take a task description in place of a contract.
- A path that is not a file: say so and stop.

## Steps

### 1. Check the Contract

Run `node qa/contract.mts check <path>`. It prints `ok <path>` or one line per problem.

When it does not print `ok`, show its lines, say the contract is not ready, and stop. Do not repair the contract
and do not start the expert on it; the planner fixes it, or a person approves an amendment.

Confirm with the person that this contract is the approved one. Never approve it for them.

### 2. Implement

Spawn the `qa-automation-expert` agent with the contract path only: no plan, no summary of the conversation, no
extra instructions. It reads `framework-rules` and `project-facts`, implements the cases, runs the definition of done
and leaves its run record under `.qa/runs/<contract-name>/`.

If it stops with an amendment request, show the amendment to the person. Only a person writes the `Approved:` line;
never write it yourself. After it is written, run the check again and, when it prints `ok`, spawn the expert again
with the same path.

### 3. Output

Present the expert's report:
- Files created or modified
- Tests added (titles)
- Run record path and the passed, skipped and failed counts per project, with every skip's reason
- Amendments awaiting approval, and findings

When the stand was not reachable, say that the run was not done.

When an amendment awaits approval, end by naming it and say that implementation is paused. When the run was not
done, end by saying so. Only when nothing awaits approval and the run was done, end with:
```
Implementation complete. Run /qa-review to review the code.
```
