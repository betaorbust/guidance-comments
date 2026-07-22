# Tests

Offline tests for the guidance-comments action. They run the real `action.yml`
under [`act`](https://github.com/nektos/act) (Docker), but redirect the GitHub
API to a local mock server so no network access or real pull request is needed.

## Running

```sh
./tests/run.js
```

The script drives the action through each state and asserts the API call it
makes:

| Scenario                | Inputs                                     | Expected call |
| ----------------------- | ------------------------------------------ | ------------- |
| create guidance         | show + guidance-body, no existing comment  | `POST`        |
| update guidance         | show + guidance-body, existing comment     | `PATCH`       |
| resolve guidance        | not-show + resolved-body, existing comment | `PATCH`       |
| remove (empty guidance) | show + empty guidance-body, existing       | `DELETE`      |
| remove (empty resolved) | not-show + empty resolved-body, existing   | `DELETE`      |
| initial (nothing to do) | not-show, no existing comment              | none          |

Exit code is non-zero if any scenario fails.

## How it works

The action's underlying steps (`peter-evans/find-comment`,
`peter-evans/create-or-update-comment`, `actions/github-script`) all build their
client via `@actions/github`, whose Octokit base URL defaults to
`$GITHUB_API_URL`. `run.js` points that at `tests/mock-github.js`, so every
list/create/update/delete the action performs is served and recorded locally.

- `mock-github.js` — the mock API server (Node's built-in `node:http`).
  `MOCK_EXISTING=1` makes the comment list return one existing guidance comment;
  otherwise it returns an empty list.
- `workflow.yml` — a `workflow_dispatch` workflow that calls `uses: ./` with the
  scenario inputs. It lives here (not in `.github/workflows`) so it never runs in
  real CI, where it would fail against the live API.

## Requirements and first run

- Docker (running), `act` (`brew install act`), and Node (for the mock server).
- The **first** run fetches the `act` runner image and the referenced actions
  online (one time), then caches them under `~/.cache/act`. Subsequent runs are
  fully offline (`--action-offline-mode`). `run.js` detects a cold cache and does
  this warmup automatically.

On Apple M-series chips, `act` prints an architecture warning. If a run
misbehaves, force emulation:

```sh
GC_ARCH=linux/amd64 ./tests/run.js
```
