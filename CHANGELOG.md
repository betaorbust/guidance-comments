# Changelog

## v2.0.0

### 🚨Breaking:

- Renamed action inputs
    - `guidance-comment` → `guidance-body`
    - `resolved-comment` → `resolved-body`
- Action input `show-guidance` must now be exactly `"true"`/`"false"`
    - Invalid values now fail fast instead of silently doing nothing

### Fixed:

- Empty guidance-body/resolved-body now removes the existing comment
- Hardened against shell/$GITHUB_OUTPUT injection
- Debug step now runs only with debug logging on

### Chore:

- Pinned-action SHAs annotated with versions + added Dependabot

### Docs:

- Added concurrency guidance to prevent duplicate comments
- Consistent "guidance" naming across steps/docs

### Tests:

- Added test suite

## v1.0.0

Initial release of guidance comments action.
