# GitHub Workflow

This project is hosted on GitHub so Codex, Claude, and human contributors can share the same source of truth. GitHub is not required to run the local prototype, but it is the right place to keep history, review changes, recover older versions, and move work between machines.

Repository:

```text
git@github.com:richardjiangs/rolls-royce-phantom.git
```

## Daily Workflow

Before starting work, make sure the local copy is on the latest committed version:

```bash
git status --short --branch
git pull
```

Run the project locally:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

After a code change, run the smoke check:

```bash
npm run smoke
```

Review the change before committing:

```bash
git status --short
git diff
```

Commit and push:

```bash
git add <changed-files>
git commit -m "Describe the change"
git push
```

## Working With Codex And Claude

This project is often changed by AI coding agents. Keep each task small enough that the agent can understand the target behavior, inspect the relevant modules, edit the right files, and verify the result.

Good task shape:

- Describe the visible behavior or bug first.
- Mention the mode involved, such as manual driving, lane assist, adaptive cruise, chauffeur, cabin controls, audio, or rendering.
- Ask the agent to read `README.md` and the relevant file in `docs/` before changing code.
- Ask for `npm run smoke` after code changes.
- Ask the agent to summarize changed files before committing.

When an agent changes the project, the normal finish should be:

```bash
npm run smoke
git status --short
git diff
git add <changed-files>
git commit -m "Short, specific commit message"
git push
```

Avoid mixing unrelated changes in one commit. If a driving physics fix and a UI redesign are both needed, do them as separate commits.

## Branches

For small solo changes, committing directly to `main` is acceptable while the project is private and experimental.

For larger changes, use a branch:

```bash
git switch -c feature/descriptive-name
```

Then commit and push the branch:

```bash
git push -u origin feature/descriptive-name
```

Use branches for work that may take several sessions, may break the app temporarily, or changes a large area such as physics, rendering, audio, or future Godot migration planning.

## What To Commit

Commit source files, documentation, scripts, and small project assets.

Do not commit:

- `node_modules/`
- `dist/`
- `.DS_Store`
- temporary logs
- secrets, tokens, API keys, or private credentials

The `.gitignore` file already covers the common generated files for this project.

## First-Time Setup On A New Machine

Clone the repository:

```bash
git clone git@github.com:richardjiangs/rolls-royce-phantom.git
cd rolls-royce-phantom
```

Check that Git is connected to GitHub:

```bash
git remote -v
ssh -T git@github.com
```

The SSH check should authenticate successfully. GitHub will still say it does not provide shell access; that is normal.

Run the local checks:

```bash
npm run smoke
```

Start the local server:

```bash
npm run dev
```

## Common Recovery Commands

See what changed:

```bash
git status --short
git diff
```

See recent commits:

```bash
git log --oneline -5
```

Discard only one local file that you are sure you do not need:

```bash
git restore path/to/file
```

Never use broad destructive commands such as `git reset --hard` unless the goal is absolutely clear and the current local changes have been reviewed.

## Release Notes For Future Migration

As the Web prototype moves toward a real 3D game, keep GitHub history clean around major boundaries:

- Web physics behavior changes should mention the driving mode affected.
- Rendering changes should mention whether Canvas, SVG, or future 3D planning is involved.
- Data changes should stay in `src/data/` when possible.
- Migration notes should go in `docs/GODOT_MIGRATION.md`.

Clean history will make it easier to compare the Web prototype against a future Godot version and decide which systems should be ported directly.
