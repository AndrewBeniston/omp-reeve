---
status: superseded by ADR-0006
---

# Self-update is off unless a launcher says otherwise

Reeve now updates itself from its own feed. ADR-0006 made that decision.

This repository is Andrew's fork of `omp-web`. npm `latest` is the upstream author's package, and the in-app update button installs it with `bun add --global omp-web@latest`, which replaces the fork. On 2026-09-02 we decided that the install plan in `lib/omp-updates.ts` treats an unset `OMP_WEB_DISABLE_SELF_UPDATE` as disabled, and only an explicit `0` enables the install. The indicator still shows the manual command.

## Considered Options

Setting the variable in each launcher was tried first. The review found that the desktop launcher starts Next directly. A packaged desktop run could still overwrite the fork. A default in the install plan covers every launcher in one place.

## Consequences

ADR-0005 named the product Reeve and ended upstream installation.
The old environment flag cannot enable the upstream installer.
The update indicator remains hidden until Reeve owns a release feed.
