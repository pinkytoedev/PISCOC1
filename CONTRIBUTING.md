## 🤝 Contributing Guide

Thanks for your interest in contributing to PISCOC! This document explains how to fork, develop, and submit changes.

### 1) Prerequisites
- Node.js 20+
- npm 9+ (or yarn/pnpm if you prefer)
- PostgreSQL 16+
- A GitHub account and a fork of this repo

### 2) Fork and clone
```bash
# On GitHub: click Fork on the repository page

# Locally: clone your fork
git clone https://github.com/<your-username>/PISCOC1.git
cd PISCOC1

# Add the upstream remote (original repo) to keep your fork in sync
git remote add upstream https://github.com/jawednur/PISCOC1.git
git fetch upstream
```

### 3) Create a feature branch
```bash
git checkout -b feat/<short-topic>
# Examples: feat/instagram-pagination, fix/discord-rate-limit, docs/n8n-railway
```

### 4) Local setup
```bash
npm install

# Copy and edit environment variables
cp .env.example .env
# Fill required values in .env (do not commit secrets)

# Prepare database (if applicable to your change)
npm run db:push

# Quick readiness checks
npm run test:setup
npm run test:neon

# Start dev
npm run dev
```

### 5) Code style and quality
- TypeScript must compile: `npm run check`
- Project must build: `npm run build`
- Follow clear naming and readable code (see codebase patterns)
- Avoid committing commented-out code and debug logs
- Do not commit secrets, tokens, or `.env` files

Suggested commit convention (Conventional Commits):
```
feat: add Instagram media pagination
fix: handle Discord 429 with exponential backoff
chore: bump dependencies and tighten .gitignore
docs: add Railway n8n deployment guide
```

### 6) Tests and manual verification
- If your change is user-facing, manually verify the flow end-to-end
- For DB-related changes, ensure migrations or schema pushes succeed
- Run startup checks: `npm run test:setup` and `npm run test:neon`

### 7) Keep your branch up to date
```bash
# Sync with upstream main before opening a PR
git fetch upstream
git rebase upstream/main

# Or merge if you prefer (rebase is preferred for a linear history)
# git merge upstream/main
```

### 8) Commit and push
```bash
git add -A
git commit -m "feat: short, descriptive message"
git push -u origin HEAD
```

### 9) Open a Pull Request
On your fork, click “Compare & pull request”. Fill out the PR description:
- What changed and why
- Any breaking changes or migrations
- Screenshots or GIFs for UI changes
- Checklist (see below)

### PR checklist
- [ ] Builds successfully: `npm run build`
- [ ] Type checks pass: `npm run check`
- [ ] Env/secrets untouched (no `.env`, tokens, or keys committed)
- [ ] Docs updated if behavior/config changed (e.g., README, guides)
- [ ] Tested locally (describe how you verified it works)

### 10) Review process
- Maintainers will review and may request changes
- Please respond to comments and push updates to the same branch
- Once approved, a maintainer will merge your PR

### Security and secrets
- Never commit `.env`, credentials, API keys, or tokens
- Use placeholders in code and docs; put real values in your local `.env`
- If you suspect a secret was exposed, notify maintainers privately and rotate it

### Issues and feature requests
- For bugs: include steps to reproduce, expected vs actual behavior, logs if possible
- For features: describe the use case, scope, and any alternatives considered

### License
By contributing, you agree that your contributions will be licensed under the repository’s MIT license.


