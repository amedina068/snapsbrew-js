# Contributing

Thank you for your help. This file tells you how to set up the project and how to send a change.

## Set up

1. Install Node.js 22 or later. The build tools need Node.js 22. The package itself runs on Node.js 20.
2. Clone the repository.
3. Run `npm ci`.

## Commands

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `npm test`              | Runs the unit tests with Vitest.                                 |
| `npm run typecheck`     | Runs `tsc --noEmit` on the source and on the tests.              |
| `npm run lint`          | Runs Biome for lint and format.                                  |
| `npm run format`        | Applies the Biome format and the safe fixes.                     |
| `npm run build`         | Builds `dist/` with tsdown.                                      |
| `npm run check:package` | Runs publint and Are the Types Wrong on the package.             |
| `npm run smoke:node`    | Imports the build in Node.js (ESM and CommonJS) and signs a URL. |
| `npm run smoke:bun`     | Does the same check in Bun.                                      |
| `npm run smoke:deno`    | Does the same check in Deno.                                     |

Run the smoke commands after `npm run build`.

## Integration tests

The integration tests call a real Snapsbrew instance. They are read-only, except for one free preview.

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

## Code of conduct

This project uses the [Contributor Covenant](CODE_OF_CONDUCT.md). By your participation, you agree to obey it.
