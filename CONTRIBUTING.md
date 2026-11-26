# Contributing

Thank you for your help. This file tells you how to set up the project and how to send a change.

## Set up

1. Install Node.js 22.18 or later. The build tools need Node.js 22.18. The package itself runs on Node.js 22.12 or later.
2. Clone the repository.
3. Run `npm ci`. The `prepare` script builds `dist/`.

## Commands

| Command                 | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `npm test`              | Runs the unit tests with Vitest.                                                     |
| `npm run typecheck`     | Runs `tsc --noEmit` on the source and on the tests.                                  |
| `npm run lint`          | Runs Biome for lint and format.                                                      |
| `npm run format`        | Applies the Biome format and the safe fixes.                                         |
| `npm run build`         | Builds `dist/` with tsdown.                                                          |
| `npm run check:package` | Runs publint and Are the Types Wrong on the package.                                 |
| `npm run smoke:node`    | Imports the build in Node.js (ESM and CommonJS), signs a URL and verifies a webhook. |
| `npm run smoke:bun`     | Does the same check in Bun.                                                          |
| `npm run smoke:deno`    | Does the same check in Deno.                                                         |

Run the smoke commands after `npm run build`.

## Integration tests

The integration tests call a real Snapsbrew instance. They are read-only, except for one preview. A preview stores nothing.

1. Set `SNAPSBREW_TEST_URL` to the root URL of the instance.
2. Set `SNAPSBREW_TEST_TOKEN` to a token with the `api_requests` ability.
3. Run `npm test`.

If one of the two variables is not set, Vitest skips the integration tests.

## Rules for code

- Add no runtime dependency.
- Do not import a Node.js module in `src/`. A test in `test/client.test.ts` makes sure of this.
- Use the global `fetch` and Web Crypto only.
- Mock `fetch` in tests. Do not mock modules.
- Add a test for each change in behavior.

## Rules for text

Write documentation, comments and commit messages in Simple English (ASD-STE100, pragmatic mode):

- Write procedures in the imperative, with 20 words or fewer in each sentence.
- Write descriptions with 25 words or fewer in each sentence.
- Use the active voice.
- Use one word for one meaning.
- Do not use contractions or semicolons.
- Do not use "should", "may", "might", "could" or "would".

## Send a change

1. Make a branch from `main`.
2. Make the change and its tests.
3. Run `npm run lint`, `npm run typecheck` and `npm test`.
4. Add a line to `CHANGELOG.md` under the next version.
5. Open a pull request and fill in the form.

## Pull request titles

The title of a pull request must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The `PR title` check of the CI fails if the title does not follow it. The titles of the merged pull requests become the lines of the release notes, so a clear title helps each user.

Start the title with a type: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` or `revert`. A scope in parentheses is optional. Examples:

- `feat: add a method to cancel a snap batch`
- `fix: send the idempotency key again on a retry`
- `docs: add a Cloudflare Workers example`

## Release

The `Release` workflow (`.github/workflows/release.yml`) publishes the package to npm with trusted publishing (OIDC). GitHub gives the job a short-lived token. The repository has no npm secret. The workflow runs only by hand, in the `npm` environment. This environment accepts only the `main` branch and the `v*` tags.

1. Set the new version: `npm version <version> --no-git-tag-version`. This command changes `package.json` and `package-lock.json`.
2. In `CHANGELOG.md`, move the lines under `Unreleased` to a new section `## [<version>] - <date>`.
3. Open a pull request with these changes. Merge it.
4. Start a test run: `gh workflow run release.yml --ref main`. The `dry-run` input is on by default, so the workflow packs the package but does not publish it.
5. Read the log of the test run. Make sure that the package contains the correct files.
6. Publish the package: `gh workflow run release.yml --ref main -f dry-run=false`.
7. Create the GitHub release `v<version>`. Use the section of `CHANGELOG.md` as the notes.

### First release

npm accepts a trusted publisher only for a package that exists. Thus the first version needs two more steps:

1. Publish the first version one time from a local clone: `npm publish --access public`.
2. On npmjs.com, open the settings of the package. Add a trusted publisher for GitHub Actions: owner `amedina068`, repository `snapsbrew-js`, workflow `release.yml`, environment `npm`.

## Triage

Each new issue gets the `needs-triage` label. The maintainer reads the issue and replaces `needs-triage` with a type label, for example `bug`, `enhancement`, `documentation` or `question`.

## Code of conduct

This project uses the [Contributor Covenant](CODE_OF_CONDUCT.md). By your participation, you agree to obey it.
