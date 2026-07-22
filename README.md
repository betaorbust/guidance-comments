# `guidance-comments` GitHub Action

This is a GitHub action specifically for use with pull requests, where developer
guidance is provided in PR comments.

The main use case is putting an approachable face on automated code checks, and
providing a space for developer education, alignment, and context directly in
the PR without taking up reviewer time to do so.

The action handles showing the guidance when needed, and resolving or removing
it once the input conditions are no longer met.

The three states are:

- Initial:
    - When `inputs.show-guidance` is `"false"`, and no previous guidance is
      present.
- Guidance:
    - When `inputs.show-guidance` is `"true"`.
    - Adds or updates guidance with `inputs.guidance-body`
- Resolved:
    - When `inputs.show-guidance` is `"false"`, and previous guidance
      exists (showing that guidance was previously needed)
    - Adds or updates guidance with `inputs.resolved-body`

Under the hood, guidance is created and updated using Peter Evans'
fantastic
[create-or-update-comment](https://github.com/marketplace/actions/create-or-update-comment)
and [find-comment](https://github.com/marketplace/actions/find-comment) actions.

### Action Configuration

| Input           | Type                  | Required | Default        | Description                                                                                                                                                                                                                                 |
| --------------- | --------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | String                | ✓        | N/A            | The unique identifier for the guidance type. <br/> Example `<guidance name>-${{ github.event.pull_request.number }}` <br/> 🚨 **Do not use unvalidated user input as this ends up in the resulting guidance.**                              |
| `pr-number`     | String                | ✓        | N/A            | The PR number. <br/> Generally `${{ github.event.pull_request.number }}`                                                                                                                                                                    |
| `show-guidance` | `"true"` or `"false"` | ✓        | N/A            | If the guidance should be shown.                                                                                                                                                                                                            |
| `guidance-body` | String                |          | `''`           | Body to show in the Guidance state. <br/> If empty or unset, any existing guidance is removed. <br/> 🚨 **Do not use raw user input as this ends up in the resulting guidance and could pose a security risk through malicious links etc.** |
| `resolved-body` | String                |          | `''`           | Body to show in the Resolved state.<br/> If empty or unset, any existing guidance is removed. </br> 🚨 **Do not use raw user input as this ends up in the resulting guidance and could pose a security risk through malicious links etc.**  |
| `token`         | String                |          | `GITHUB_TOKEN` | GitHub token for API access.                                                                                                                                                                                                                |

### Permissions

The composite action requires the following permissions be set on the
`GITHUB_TOKEN` by the workflow using it:

```yml
permissions:
    pull-requests: write
```

### Concurrency

The action locates its guidance by searching for an existing comment and then
creating or updating it. If two runs for the same PR overlap, both can find no
existing guidance and each create one, producing duplicates.

Set a `concurrency` group in the calling workflow so runs for a given PR are
serialized. Use `cancel-in-progress: false` so each queued run finishes and the
next one sees its result:

```yml
concurrency:
    group: guidance-${{ github.workflow }}-${{ github.event.pull_request.number }}
    cancel-in-progress: false
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
              uses: actions/checkout@v7
            - name: See if there are problems
              id: check-for-issues
              run: |
                  # Simulate checking for issues in the codebase
                  echo "issue=There was a problem" >> $GITHUB_OUTPUT
            - name: Add guidance
              uses: betatorbust/guidance-comments@v2
              with:
                  name: 'example-guidance'
                  pr-number: ${{ github.event.pull_request.number }}
                  show-guidance: ${{ steps.check-for-issues.outputs.issue != '' }}
                  guidance-body: |
                      Hi! It looks like there might be an issue:
                      ${{ steps.check-for-issues.outputs.issue }}
                  resolved-body: |
                      Thanks for addressing the issue!
```
