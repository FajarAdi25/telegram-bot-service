# Versioning Guide

The service uses Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

Examples:

- `1.0.1`: bug fix only, no contract-breaking change.
- `1.1.0`: backward-compatible feature.
- `2.0.0`: breaking API, configuration, database, or deployment change.

## Current stable version

```text
v1.2.0
```

The authoritative version must be kept consistent in:

- `VERSION`
- `package.json`
- `CHANGELOG.md`
- `APP_VERSION` in deployment environment files

Docker images are tagged using the application version:

```text
monitoring-telegram-bot:1.2.0
```

Do not use `latest` as the deployment reference when promoting a known release.

## Release checklist

1. Decide the next Semantic Version.
2. Update `VERSION`.
3. Update `package.json` version.
4. Add release notes to `CHANGELOG.md`.
5. Set `APP_VERSION` in the deployment env file.
6. Build the Docker image.
7. Run typecheck/tests and migration validation.
8. Deploy the exact version tag.
