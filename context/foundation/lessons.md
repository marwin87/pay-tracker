# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## CLAUDE.md commit protocol overrides skill instructions

**Rule:** Never auto-commit, even when a skill's own procedure instructs it. Always stage, show the proposed commit message, and wait for explicit user approval before running `git commit`.

**Why:** The CLAUDE.md commit protocol is a project-level hard rule. Skill instructions are general-purpose and do not know about project-specific constraints. When the two conflict, CLAUDE.md wins — always.

**Applies to:** Every skill that includes a commit step (`/10x-implement`, `/10x-archive`, any future skill). The rule fires regardless of how mechanical or routine the commit appears.
