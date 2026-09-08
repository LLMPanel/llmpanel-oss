# Security Policy

## Supported versions

Security fixes go into the latest release. Older tags are not patched — upgrade
with `docker compose pull && docker compose up -d`.

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through
[GitHub Security Advisories](https://github.com/LLMPanel/llmpanel-oss/security/advisories/new),
or email **security@llmpanel.io**.

Please include what an attacker can do, the steps to reproduce it, the version
you tested, and whether you were in `self-hosted` or `cloud` mode.

We will acknowledge within 3 working days and keep you updated as we work on a
fix. Once a fix ships we will credit you in the advisory unless you would rather
we did not.

## What is in scope

- Authentication and session handling, including 2FA and invitations
- The inference gateway and API-key authorisation, especially anything that
  crosses between tenants or deployments
- Credential encryption at rest and the optional KMS path
- The installer and the Docker images we publish
- Server-side request forgery through provider or webhook configuration

## What is not

- Anything requiring an attacker to already be root on the host. The API needs
  the Docker socket to provision inference containers; that is inherent to what
  it does.
- Missing hardening headers with no demonstrated impact.
- Findings from an automated scanner with no working proof of concept.
- Denial of service through sheer request volume — rate-limit at your edge.

## Running LLMPanel safely

- Set `ENCRYPTION_KEY` to a fresh `openssl rand -hex 32`, or use `KMS_URL` so the
  key never touches the host disk. Provider credentials are encrypted with it.
- Put the panel behind TLS. The installer configures Traefik and Let's Encrypt
  when you give it a domain.
- Do not expose the API port publicly if you are only using the dashboard.
- The API logs request bodies. Treat those logs as sensitive.
