# Guarded live smoke

The live smoke is a fail-closed integration check. It admits exactly one
caller-selected release `*.archiplugin`, copies it immediately, and verifies
the supplied SHA-256 before provisioning anything. Development JARs, mutable
build outputs, archive discovery, and sibling-repository runtime scripts are
not accepted.

## Independent runtime inputs

The caller supplies these non-secret, pinned inputs; no download is performed:

* `ARCHIMATE_ARCHI_RUNTIME_ARCHIVE`: one regular ZIP or tar archive containing
  the pinned Archi distribution;
* `ARCHIMATE_ARCHI_RUNTIME_SHA256`: its SHA-256;
* `ARCHIMATE_ARCHI_VERSION`: currently `5.9.0`;
* `ARCHIMATE_MEMGRAPH_IMAGE`: currently
  `memgraph/memgraph@sha256:854d7de6dec74f867724cab07db661262e824381ed9a0e1d682c7a07b9357c6a`;
* optional `ARCHIMATE_ARCHI_LAUNCHER_RELATIVE` (default `Archi`).

The runtime extractor safely handles the archive's common `Archi/` top-level
directory and installs exactly one expected
`com.archimate.softwarefactory-*.jar` from the accepted archive into the
run-scoped `$HOME/.archi/dropins`. Unexpected, missing, duplicate, traversal,
and unsafe archive members fail closed. `Archi.ini` receives a run-scoped
`-Duser.home`; `HOME` and all XDG directories are disposable.

## Public UI bootstrap

The driver starts stock pinned Archi with only normal Eclipse/Archi switches:

```text
Archi -clean -consoleLog -nosplash
```

It never passes invented `--smoke-*` arguments or invokes sibling UAT scripts.
Using Dogtail/AT-SPI and X11 only, it:

1. chooses the repository-owned ArchiMate Exchange fixture
   `smoke/fixtures/review-model-exchange.xml` and a disposable Git directory
   through **File → Create Software Factory Project...**;
2. lets the accepted plug-in provision its own digest-pinned Memgraph project;
3. reads the public loopback endpoint file;
4. opens **Manage Agent Query Access...**, issues a one-time identity, reads it
   from the visible **Copy Bearer Token Now** dialog, and dismisses the dialog.

The fixture is an ArchiMate Exchange XML document, not native `.archimate`
XML. It preserves the retained demonstrator shape: schema location, typed
Application and Technology & Physical content, Relations organization, and
views. The required ArchiMate schema files are copied into `smoke/fixtures/`
for local shape validation; no sibling source is executed at runtime. A
bounded setup-only control uses `control-model-exchange.xml` and must reach
`Synchronized` before the full review fixture is attempted. No direct
Bolt/Cypher or plugin-private API is used by this repository.

## Credential boundary and exercise

The one-time identity is streamed directly to
`swamp vault put live-smoke-vault ARCHI_BEARER_TOKEN` on stdin. It is never an
argv item, environment variable, evidence value, log line, or clipboard value.
The vault expression is the only credential reference in the temporary model
definition. Captured command output is discarded.

The smoke invokes `start_review`, `collect_evidence`,
`record_assessments`, `record_synthesis`, `record_followup`, and `disposition`.
Collection reaches only the public v1 discovery and active
folders/elements/relationships pages. It does not use Memgraph directly,
mutation routes, diagrams, history, or unreferenced repository content.

A shell trap and driver `finally` block stop stock Archi and fail closed if the
plugin-owned container or its volumes remain. The temporary endpoint, Swamp
repository, vault, fixture, evidence, UI state, project configuration, and
plugin-owned Docker resources are deleted on success, failure, or interruption.
Only a redacted method/revision summary is printed before cleanup.

## Exact supplied-input command

```bash
ARCHIMATE_FACTORY_PLUGIN=../archimate-software-factory/.swamp/releases/TASK-35/0.1.0-build.1/archimate-software-factory-0.1.0-build.1.archiplugin \
ARCHIMATE_FACTORY_PLUGIN_SHA256=0ae52b024fa0afe76c6985e7c701c7fd5f64c68fa36aa61aa303cfcf62172b9b \
ARCHIMATE_ARCHI_RUNTIME_ARCHIVE=../archimate-software-factory/.runtime-cache/Archi-Linux64-5.9.0.tgz \
ARCHIMATE_ARCHI_RUNTIME_SHA256=d3fdff119c39ba907476fca14b4b1f2aaa7b0b8b5ceaf1835be3bd594e624dcf \
ARCHIMATE_ARCHI_VERSION=5.9.0 \
ARCHIMATE_MEMGRAPH_IMAGE=memgraph/memgraph@sha256:854d7de6dec74f867724cab07db661262e824381ed9a0e1d682c7a07b9357c6a \
scripts/live-smoke.sh
```

Before the full smoke, run the parity control with the same artifact, runtime,
and image inputs:

```bash
ARCHIMATE_SMOKE_FIXTURE_NAME=control-model-exchange.xml \
ARCHIMATE_SMOKE_SETUP_ONLY=1 scripts/live-smoke.sh
```

The control exits successfully only after public setup reaches `Synchronized`.

The one-time identity is issued by the public UI, so no token pipe is needed
for this command. Do not claim smoke verification until the complete command
succeeds and cleanup/secret scans pass.
