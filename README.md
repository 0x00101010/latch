<p align="center">
    <img src="./assets/icon.png" alt="Latch" width="128">
</p>

<h1 align="center">Latch</h1>

<h4 align="center">
    Personal productivity — capture, triage, view, search. Built as a Raycast extension.
</h4>

<p align="center">
  <img src="https://img.shields.io/badge/Raycast-Extension-FF6363.svg?style=flat&labelColor=1C2C2E&logo=raycast&logoColor=white" alt="Raycast">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?style=flat&labelColor=1C2C2E&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-d1d1f6.svg?style=flat&labelColor=1C2C2E&color=a78bfa&logo=googledocs&logoColor=white" alt="License">
</p>

<p align="center">
  <a href="#whats-latch">What's Latch?</a> •
  <a href="#features">Features</a> •
  <a href="#install">Install</a> •
  <a href="#usage">Usage</a> •
  <a href="#task-format">Task Format</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#roadmap">Roadmap</a>
</p>

## What's Latch?

Latch is a Raycast extension for personal task management. Capture tasks instantly via hotkey, auto-triage them with AI, view and manage everything in one list, and search your knowledge base — all without leaving your keyboard.

Tasks live in markdown files, sync via git, and work across machines. No vendor lock-in, no cloud dependencies.

## Features

### Quick Add (Phase 2 — done)

- **Hotkey capture** — Global hotkey opens a single text field, press Enter, done
- **Append to inbox** — Tasks land in `~/src/workspace/inbox.md` with timestamp
- **Sub-2-second capture** — No category selection, no friction

### Task Format & Archive (Phase 1 — done)

- **Standardized format** — `- [ ] P{0-3} | description | optional:SOURCE-REF`
- **Priority levels** — P0 (Urgent), P1 (High), P2 (Medium), P3 (Low)
- **Source references** — `LINEAR:CHAIN-1234`, `GH:org/repo#123`
- **Archive** — Completed tasks move to `todos/archive.md` with completion date, grouped by month

### Planned

- **My Tasks** — Unified task list with priority sorting, project grouping, complete-to-archive, priority cycling
- **Triage Inbox** — AI-powered auto-categorization every 10 minutes using Raycast AI
- **Search Knowledge** — Semantic search across workspace via QMD
- **Auto-reindex** — Background QMD index updates

## Install

### Prerequisites

- [Raycast](https://raycast.com) installed
- [just](https://github.com/casey/just) command runner (optional, for dev shortcuts)

### Build & Install

```sh
git clone https://github.com/francis/latch.git
cd latch
npm install
just b
```

The extension will appear in Raycast after building. Run `just dev` for development mode with hot reload.

## Usage

### Commands

| Command | Mode | Description |
|---------|------|-------------|
| **Quick Add** | Form | Capture a task to inbox via single text field |
| **My Tasks** | List | View and manage all tasks (coming Phase 3) |
| **Triage Inbox** | Background (10m) | Auto-categorize inbox items using AI (coming Phase 4) |
| **Search Knowledge** | List | Semantic search across workspace (coming Phase 6) |
| **Reindex Knowledge Base** | Background (15m) | Update QMD search index (coming Phase 5) |

### Justfile Commands

| Command | Alias | Description |
|---------|-------|-------------|
| `just build` | `just b` | Build the extension |
| `just dev` | `just d` | Start development mode |
| `just lint` | `just l` | Run linter |
| `just typecheck` | `just t` | Run TypeScript type checking |
| `just fix` | `just f` | Auto-fix lint issues |

## Task Format

### Active tasks (`todos/work.md`, `todos/personal.md`)

```markdown
- [ ] P1 | NsmRng holds raw fd with no mutual exclusion | GH:base/base#1141
- [ ] P2 | Staged syncing - architecture in progress
- [ ] P3 | Plan for QMDB quick verification
```

### Inbox (`inbox.md`)

```markdown
- 2026-04-03 14:30 | buy groceries
- 2026-04-03 15:22 | read that paper on content-addressed storage
```

### Archive (`todos/archive.md`)

```markdown
## 2026-04

- [x] P2 | QMDB variants | 2026-04-03
- [x] P2 | Fix PCR0 length, should be 48 bytes | GH:base/base#1141 | 2026-04-03
```

## Architecture

```
╔═══════════════════════════════════════════════════════════════════════╗
║  CAPTURE (Raycast hotkey → Form → append inbox.md)          < 2 sec ║
╠═══════════════════════════════════════════════════════════════════════╣
║  AUTO-TRIAGE (background, every 10min)                        async ║
║    → AI categorizes + prioritizes with live workspace context        ║
║    → routes to todos/work.md or todos/personal.md                    ║
╠═══════════════════════════════════════════════════════════════════════╣
║  VIEW + ACT (Raycast list → sorted by priority, grouped by project) ║
║    → complete → archive with date   |   delete → discard            ║
╠═══════════════════════════════════════════════════════════════════════╣
║  SEARCH (QMD semantic search across workspace)                      ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Workspace Structure

```
~/src/workspace/
├── inbox.md              # Raw capture, append-only
├── todos/
│   ├── work.md           # Active work tasks (P{n} | desc | ref)
│   ├── personal.md       # Active personal tasks
│   └── archive.md        # Completed tasks with dates, grouped by month
├── schedules/            # Daily plans
├── journal/              # Daily reflections
├── projects/             # Project plans and docs
└── knowledge/            # Technical knowledge base
```

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Done | Foundation — inbox, format migration, archive |
| 2 | Done | Scaffold extension + Quick Add command |
| 3 | Next | My Tasks — list, complete-to-archive, priority cycling |
| 4 | Planned | Triage Inbox — AI auto-categorization |
| 5 | Planned | QMD setup + auto-reindex |
| 6 | Planned | Search Knowledge command |
| 7 | Planned | Skill updates (`/add`, `/prio`, `/task`) |
| 8 | Planned | Config/memories documentation |

## License

MIT