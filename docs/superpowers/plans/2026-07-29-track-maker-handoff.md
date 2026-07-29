# Track Maker — Handoff (2026-07-29 session)

## What this is

Implementing the `track-maker` extension (procedural melody/drum/soundtrack generator, no ML — see spec/plan below) via `superpowers:subagent-driven-development`. Session paused mid-Task-6.

- **Spec:** `docs/superpowers/specs/2026-07-29-track-maker-design.md`
- **Plan (13 tasks):** `docs/superpowers/plans/2026-07-29-track-maker.md`
- **Workspace/ledger:** `.superpowers/sdd/2026-07-29-track-maker/` (inside the worktree — briefs, reports, review diffs, `progress.md` ledger)

## Where the work is happening

- **Worktree:** `C:\Users\evan0\OneDrive\Documents\Programming\Lyniaca\LynGame\.claude\worktrees\tidy-finding-storm`
- **Branch:** `worktree-tidy-finding-storm`
- **HEAD as of pause:** `d1f9bf4` — `fix(track-maker): remove swing parameter and prevent syncopation from silencing voices with zero base pulses`

`main` was NOT touched by this work (see gotcha below) — it's still at `cce06a5` (spec + plan docs only).

## How to resume

1. Re-enter the worktree above (or re-invoke `superpowers:subagent-driven-development` from a session that will `EnterWorktree`/`cd` there).
2. Read the ledger: `.superpowers/sdd/2026-07-29-track-maker/progress.md` — it names the plan file on line 1 and lists `Task N: complete` lines for everything done. **Tasks 1-5 are done and reviewed clean.** Resume at **Task 6**.
3. Task 6's brief was already extracted to `.superpowers/sdd/2026-07-29-track-maker/task-6-brief.md` (can reuse or regenerate via `scripts/task-brief`).
4. Continue the normal loop from there: dispatch implementer → review → (fix loop if needed) → next task, through Task 13, then the final whole-branch review, then `superpowers:finishing-a-development-branch`.

## Progress so far (from the ledger)

- **Task 1** — extension scaffold (manifest, backend save route, HTML shell): complete.
- **Task 2** — `rng.mjs` seeded PRNG: complete, clean review.
- **Task 3** — `theory.mjs` note/scale math: complete, clean review. (See gotcha below — this is the task that hit the branch bug.)
- **Task 4** — `melody.mjs` melody generator: complete, clean review. 3 minor items deferred to the final review (not blocking): inverted register range (`registerLowOctave > registerHighOctave`) isn't guarded, RNG-call-count coupling in the onset check is undocumented, a dead `min`/`max` clamp on velocity.
- **Task 5** — `drums.mjs` drum pattern generator: complete after 1 fix round. Original review found `swing` was a documented-but-unused no-op parameter and `syncopation` could inject hits into voices a style defines as silent (e.g. `boomBap.clap`). Fixed: `swing` removed entirely from `generateDrumPattern` (it's owned by `renderDrumKit` at the render layer per Task 9's design — confirmed against the plan before removing), and the syncopation flip is now guarded so 0-base-pulse voices can't be activated by it.

**Not started:** Task 6 (`arrangement.mjs`) through Task 13 (Track tab UI), plus the final whole-branch review.

## Gotcha hit this session — watch for it again

One implementer subagent (Task 3) lost track of its working directory and committed straight onto `main` instead of the worktree branch, silently advancing `main` by one commit. Caught because `scripts/review-package` reported "0 commit(s)" for the expected range — that's the tell. Recovered by cherry-picking the stray commit onto the worktree branch, then moving `main`'s ref back with the user's explicit confirmation (a plain `git branch -f`/`reset --hard` on that branch is blocked by the permission classifier when it's checked out elsewhere — `git update-ref refs/heads/main <sha>` worked instead and is the safer move anyway since it doesn't touch a different worktree's working tree).

Since then, every implementer dispatch prompt opens with an explicit `cd` to the exact worktree path plus a `git branch --show-current` sanity check, and each implementer is asked to re-confirm the branch right before its final commit. Keep doing that for Tasks 6-13. After each dispatch, independently verify with `git branch --show-current` and `git log --oneline -3` before generating the review package — don't trust the subagent's self-report alone.

## Model selection used so far (per plan's Global Constraints / SKILL.md guidance)

- Implementers for pure-logic modules with complete code in the brief (Tasks 1-10): `haiku`.
- Task reviewers: `haiku` for small/mechanical diffs (Tasks 1-3, 5's re-review), `sonnet` for diffs with more subtle correctness surface (Tasks 4-5's first review).
- Planned for later: `sonnet` for the UI-wiring tasks (11-13, since those work from prose descriptions rather than verbatim code), `opus` for the final whole-branch review.
