# Security policy

## Report a security problem

Do not open a public issue for a security problem.

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**. This opens a private GitHub security advisory.
3. Describe the problem, the affected versions and the steps to reproduce it.

Only the maintainers can read the advisory. The maintainers reply in the advisory.

## Supported versions

| Version | Security fixes |
| ------- | -------------- |
| 0.1.x   | Yes            |

## Scope

This policy covers the code of this SDK. A problem in the Snapsbrew server is out of scope here. Report it to the operator of your instance.

## Safe use of the SDK

- Keep the API token and the signing key on the server.
- Do not put a token or a signing key in a browser bundle, a log or a repository.
- If a key leaks, remove it in the Snapsbrew dashboard and make a new one.
