# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities through the repository's
[private vulnerability reporting](https://github.com/nearbycoder/yeeet.dev/security/advisories/new)
form. Do not open a public issue or include exploit details in a pull request.

Include the affected route or component, reproduction steps, likely impact, and
any suggested mitigation. Please remove credentials, user data, private share
links, and uploaded content from the report unless they are essential to the
reproduction.

Maintainers will acknowledge a report as soon as practical, investigate it, and
coordinate disclosure after a fix is available. No response-time guarantee is
made by this volunteer project.

## Supported versions

Security fixes are applied to the current `main` branch. Self-hosters should
track current releases and keep Node.js, Better Auth, Postgres, and their
storage provider patched.

## Deployment responsibility

Self-hosters are responsible for secret management, database and bucket access,
DNS, TLS, backups, abuse handling, and infrastructure-provider configuration.
Never expose the object bucket publicly or grant the custom-domain token more
authority than the application requires.
