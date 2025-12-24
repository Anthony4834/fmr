# Claude Code Rules

## Development Workflow

- Do NOT run `npm run build` or restart the dev server after every edit
- Only run build when explicitly requested or when verifying a complete feature
- Trust that the dev server hot-reloads changes automatically

## Code Style

- Use CSS variables from `globals.css` for theming (e.g., `--change-positive`, `--change-negative`)
- Prefer `var(--variable-name)` over hardcoded colors for theme-aware styling
