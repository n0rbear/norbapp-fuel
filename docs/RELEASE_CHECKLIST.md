# Release Checklist

## Secrets and Configuration

- Rotate all previously exposed API keys.
- Verify Google API restrictions by package name and signing certificate.
- Run a secret scan.
- Verify `.gitignore`.
- Confirm no `local.properties`, `.env`, keystore, APK, or AAB is staged.

## Git Audit

- Run `git status --ignored`.
- Run `git diff --cached`.
- Confirm no unwanted file is staged before commit.
- Confirm no `.idea`, `.gradle`, `.kotlin`, `build`, `app/build`, APK, AAB, JKS, keystore, or `secrets.properties` file is staged.
- Confirm no local absolute path is present in public documentation except the intentional external Design System note in `docs/DESIGN_SYSTEM.md`.

## Build and Quality

- Run a clean build.
- Run lint.
- Run unit tests.
- Run a debug APK smoke test.

## Documentation and Release Metadata

- Review `README.md`.
- Review `LICENSE`.
- Review dependency licenses.
- Verify version code and version name.
- Verify repository name.
- Verify release notes before publication.
