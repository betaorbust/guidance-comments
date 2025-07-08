# `guidance-comment` Github Action

This is a github action specifically for use with pull requests, where developer
guidance is provided in PR comments.

The three states are:

-   Initial:
    -   When `inputs.showGuidance` is false, and no previous comments are
        present for this guidance.
-   Guidance:
    -   When `inputs.showGuidance` is true.
    -   Adds or updates comment with `inputs.guidanceComment`
-   Resolved:
    -   When `inputs.showGuidance` is false, and a previous guidance comment
        exists (showing that guidance was previously needed)
    -   Adds or updates comment with `inputs.resolvedComment`

### Action Configuration

| Input              | Type                  | Required | Default        | Description                                                                                                    |
| ------------------ | --------------------- | -------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `name`             | String                | ✓        | N/A            | The unique identifier for the message. <br/> Example `<guidance name>-${{ github.event.pull_request.number }}` |
| `pr-number`        | String                | ✓        | N/A            | The PR number. <br/> Generally `${{ github.event.pull_request.number }}`                                       |
| `show-guidance`    | `"true"` or `"false"` | ✓        | N/A            | If the guidance should be shown.                                                                               |
| `guidance-comment` | String                |          | `''`           | Comment to show in the Guidance state. _If empty or unset will delete existing comment._                       |
| `resolved-comment` | String                |          | `''`           | Comment to show in the Resolved state. _If empty or unset will delete existing comment._                       |
| `token`            | String                |          | `GITHUB_TOKEN` | GitHub token for API access.                                                                                   |

### Permissions

The composite action requires the following permissions be set on the
GITHUB_TOKEN by the workflow using it:

```yml
permissions:
    pull-requests: write
```

### Example Usage

```yml
name: Example
on: pull_request
jobs:
    offerHelp:
        runs-on: ubuntu-latest
        permissions:
            pull-requests: write
        steps:
            - name: 'Check out code'
              uses: actions/checkout@v4
            - name: See if there are problems
              id: check-for-issues
              run: |
                  # Simulate checking for issues in the codebase
                  echo "issue=There was a problem" >> $GITHUB_OUTPUT
            - name: Add guidance comment
              uses: betatorbust/guidance-comment@v1
              with:
                  name: 'example-guidance'
                  pr-number: ${{github.event.pull_request.number}}
                  show-guidance:
                      ${{ steps.check-for-issues.outputs.issue != '' }}
                  guidance-comment: |
                      Hi! It looks like there might be an issue:
                      ${{ steps.check-for-issues.outputs.issue }}
                  resolved-comment: |
                      Thanks for addressing the issue!
```
