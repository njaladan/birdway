# Required workflow for every agent

These instructions apply to the entire repository, including every addition,
edit, generated asset, and documentation change. Read this file before making
changes. Do not leave completed work only in a local checkout.

## Commit and push as you work

- Work on `main`. Commit directly to `main` and push to `origin/main`.
- Make small, self-contained commits as each coherent change is ready. Do not
  accumulate unrelated work into a final large commit or wait until the end of
  the task to push everything.
- Before each commit, review the staged diff and run the checks relevant to that
  change. Run `npm run check` for gameplay, rendering, or asset changes; visually
  inspect changes to the bird, controls, camera, or scene when possible.
- Stage only the files or hunks belonging to that change. Preserve existing work
  from the user and other agents. Never commit secrets or scratch artifacts.
- Immediately after each successful commit, run `git push origin main`. Verify
  that the push succeeded before considering that increment complete.
- Fetch `origin/main` before starting and before pushing. Integrate new upstream
  commits safely. Never force-push, rewrite published history, or discard someone
  else's work. Avoid branch switching or rebasing over unrelated uncommitted work.
- If credentials, network access, branch protections, or conflicts prevent a
  push, keep the work safe, report the exact blocker, and resolve it when possible.
  Do not claim the work was pushed when it was not.
- Finish with all completed changes committed and pushed, relevant checks run,
  and a clean working tree apart from unrelated pre-existing work. Include the
  pushed commit(s) and any unresolved blockers in the final response.

## Parallel agents

All collaborating agents must follow this policy. In a shared checkout, the
coordinating agent owns staging, committing, and pushing to avoid index and
history races. Contributors send each completed, self-contained increment to
the coordinator promptly; the coordinator commits and pushes it immediately.
Agents using separate checkouts integrate each increment onto `main` with the
coordinator and verify its push. Delegation never exempts work from this policy.

These instructions express the repository owner's standing authorization to
commit and push completed changes to `main`; do not repeatedly ask for approval.
An explicit later instruction from the owner takes precedence.
