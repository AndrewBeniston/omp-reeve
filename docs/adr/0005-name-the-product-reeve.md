# Name the product Reeve

Andrew selected Reeve on 2026-09-04 after reviewing several names and current conflicts.

## Decision

The application name is Reeve.

The repository and package name is `omp-reeve`.

The desktop application identifier is `com.andrewbeniston.reeve`.

OMP remains the agent engine. Reeve remains the interface around that engine.

Existing `OMP_WEB_*` variables and `omp-web:*` saved-data keys remain compatible.

The repository remains private during initial development.

## Considered options

Praxis had a direct conflict with an existing Electron coding tool.

Harbour had several active agent and developer-tool conflicts.

Orrery had pronunciation problems and smaller agent-tool conflicts.

Fettle had active software and AI conflicts.

Reeve had small agent-tool conflicts. The `omp-reeve` qualifier made the repository identity distinct.

Reve remains an image-generation brand. Its spelling and product category differ.

## Consequences

Reeve replaces OMP-Web and OMP Desktop in product-facing text.

Technical OMP names continue where they describe the engine or preserve existing data.

The current upstream self-update source cannot publish Reeve releases.
Reeve removes that updater and its indicator until Reeve owns a release feed.
This decision supersedes ADR-0004 only where ADR-0004 allowed deliberate upstream installation.
