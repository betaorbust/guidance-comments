# `guidance-comments` GitHub Action

This is a GitHub action specifically for use with pull requests, where developer
guidance is provided in PR comments.

The main use case is putting an approachable face on automated code checks, and
providing a space for developer education, alignment, and context directly in
the PR without taking up reviewer time to do so.

The action handles showing the guidance when needed, and resolving or removing
it once the input conditions are no longer met.

The three states are:

-   Initial:
    -   When `inputs.show-guidance` is `"false"`, and no previous comments are
        present for this guidance.
-   Guidance:
    -   When `inputs.show-guidance` is `"true"`.
    -   Adds or updates comment with `inputs.guidance-comment`
-   Resolved:
    -   When `inputs.show-guidance` is `"false"`, and a previous guidance
        comment exists (showing that guidance was previously needed)
    -   Adds or updates comment with `inputs.resolved-comment`

Under the hood, comment generation and updates are handled by Peter Evans'
fantastic
[create-or-update-comment](https://github.com/marketplace/actions/create-or-update-comment)
and [find-comment](https://github.com/marketplace/actions/find-comment) actions.

### Action Configuration

| Input              | Type                  | Required | Default        | Description                                                                                                                                                                                                                              |
| ------------------ | --------------------- | -------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | String                | ✓        | N/A            | The unique identifier for the message. <br/> Example `<guidance name>-${{ github.event.pull_request.number }}` <br/> 🚨 **Do not use unvalidated user input as this ends up in the resulting comments.**                                 |
| `pr-number`        | String                | ✓        | N/A            | The PR number. <br/> Generally `${{ github.event.pull_request.number }}`                                                                                                                                                                 |
| `show-guidance`    | `"true"` or `"false"` | ✓        | N/A            | If the guidance should be shown.                                                                                                                                                                                                         |
| `guidance-comment` | String                |          | `''`           | Comment to show in the Guidance state. <br/> 🚨 **Do not use raw user input as this ends up in the resulting comments and could pose a security risk through malicious links etc.**                                                      |
| `resolved-comment` | String                |          | `''`           | Comment to show in the Resolved state.<br/> If empty or unset will delete existing comment. </br> 🚨 **Do not use raw user input as this ends up in the resulting comments and could pose a security risk through malicious links etc.** |
| `token`            | String                |          | `GITHUB_TOKEN` | GitHub token for API access.                                                                                                                                                                                                             |

### Permissions

The composite action requires the following permissions be set on the
`GITHUB_TOKEN` by the workflow using it:

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
              uses: betatorbust/guidance-comments@v1
              with:
                  name: 'example-guidance'
                  pr-number: ${{ github.event.pull_request.number }}
                  show-guidance:
                      ${{ steps.check-for-issues.outputs.issue != '' }}
                  guidance-comment: |
                      Hi! It looks like there might be an issue:
                      ${{ steps.check-for-issues.outputs.issue }}
                  resolved-comment: |
                      Thanks for addressing the issue!
```
