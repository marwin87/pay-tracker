# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

**Commit Protocol**: When making code changes, always stage files with `git add` but **do NOT auto-commit**. Instead:

1. Stage changes: `git add <files>`
2. Copy the commit message to clipboard, then show the user:
   ```
   Changes are ready to commit:
   Commit message: <proposed-message> (✓ copied)
   ```
   Copy command: `echo -n "<proposed-message>" | pbcopy 2>/dev/null || echo -n "<proposed-message>" | clip.exe 2>/dev/null || echo -n "<proposed-message>" | xclip -selection clipboard 2>/dev/null || true`
3. Wait for user approval before running `git commit`

This gives you control over what gets committed and the final commit message. Only commit if you explicitly approve or say "go ahead and commit".

**Rationale**: Auto-committing can bundle unrelated changes or use suboptimal messages. You own the git history.

**Exception**: Skip this if you explicitly say "commit as is" or "go ahead and commit" in your message.

**Skill override**: This rule applies even when a skill's own instructions include a commit step (e.g. `/10x-archive`, `/10x-implement`). Skill procedures are general-purpose; CLAUDE.md is project law. Stage + show message + wait, always.

## Project

See @AGENTS.md for project structure, build commands, coding conventions, and domain rules.