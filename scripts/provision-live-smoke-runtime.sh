#!/usr/bin/env bash
set -euo pipefail

# Provision only disposable files. Memgraph is deliberately not started here:
# stock Archi's public project-setup command owns its digest-pinned deployment.
run_root="${1:?usage: provision-live-smoke-runtime.sh RUN_ROOT [SOURCE_ROOT]}"
source_root="${2:-$(cd "$(dirname "$0")/.." && pwd)}"
plugin="$run_root/archive/plugin.archiplugin"
verified_digest="$run_root/archive/plugin.sha256"

[[ -d "$run_root" && -f "$plugin" && -f "$verified_digest" ]] || {
  echo "run root does not contain a verified plugin archive" >&2
  exit 64
}
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 69; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 69; }
command -v swamp >/dev/null || { echo "swamp is required" >&2; exit 69; }
: "${ARCHIMATE_ARCHI_RUNTIME_ARCHIVE:?Set ARCHIMATE_ARCHI_RUNTIME_ARCHIVE to a pinned Archi distribution archive}"
: "${ARCHIMATE_ARCHI_RUNTIME_SHA256:?Set ARCHIMATE_ARCHI_RUNTIME_SHA256 to the distribution SHA-256}"
: "${ARCHIMATE_ARCHI_VERSION:?Set ARCHIMATE_ARCHI_VERSION to the pinned Archi version}"
: "${ARCHIMATE_MEMGRAPH_IMAGE:?Set ARCHIMATE_MEMGRAPH_IMAGE to the pinned Memgraph image digest}"
[[ "$ARCHIMATE_MEMGRAPH_IMAGE" == memgraph/memgraph@sha256:854d7de6dec74f867724cab07db661262e824381ed9a0e1d682c7a07b9357c6a ]] || {
  echo "ARCHIMATE_MEMGRAPH_IMAGE must be the supported digest-pinned Memgraph image" >&2
  exit 64
}
[[ "$ARCHIMATE_ARCHI_VERSION" == 5.9.0 ]] || { echo "unsupported Archi version" >&2; exit 64; }
[[ "$ARCHIMATE_ARCHI_RUNTIME_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || {
  echo "ARCHIMATE_ARCHI_RUNTIME_SHA256 must be a SHA-256" >&2
  exit 64
}
[[ -f "$ARCHIMATE_ARCHI_RUNTIME_ARCHIVE" && ! -L "$ARCHIMATE_ARCHI_RUNTIME_ARCHIVE" ]] || {
  echo "ARCHIMATE_ARCHI_RUNTIME_ARCHIVE must be one regular file" >&2
  exit 64
}

mkdir -p "$run_root"/{home,xdg-config,xdg-data,xdg-state,xdg-cache,xdg-runtime,swamp,runtime,evidence,fixture,input}
chmod 700 "$run_root"/{home,xdg-config,xdg-data,xdg-state,xdg-cache,xdg-runtime,swamp,runtime,evidence,input}
fixture_name="${ARCHIMATE_SMOKE_FIXTURE_NAME:-review-model-exchange.xml}"
[[ "$fixture_name" != */* && "$fixture_name" == *.xml ]] || {
  echo "ARCHIMATE_SMOKE_FIXTURE_NAME must be one owned XML fixture name" >&2
  exit 64
}
[[ -f "$source_root/smoke/fixtures/$fixture_name" ]] || {
  echo "requested smoke fixture is unavailable" >&2
  exit 64
}
cp -- "$source_root/smoke/fixtures/$fixture_name" "$run_root/fixture/$fixture_name"
chmod 600 "$run_root/fixture/$fixture_name"

runtime_archive="$run_root/input/archi-runtime-$(basename "$ARCHIMATE_ARCHI_RUNTIME_ARCHIVE")"
cp -- "$ARCHIMATE_ARCHI_RUNTIME_ARCHIVE" "$runtime_archive"
printf '%s  %s\n' "$ARCHIMATE_ARCHI_RUNTIME_SHA256" "$runtime_archive" | sha256sum --check --status - || {
  echo "pinned Archi runtime checksum mismatch" >&2
  exit 65
}
python3 - "$runtime_archive" "$run_root/archi" "$run_root/home" "$plugin" <<'PY'
from __future__ import annotations
import pathlib, shutil, sys, tarfile, zipfile

archive = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2]).resolve()
home = pathlib.Path(sys.argv[3]).resolve()
plugin = pathlib.Path(sys.argv[4]).resolve()
destination.mkdir(parents=True, exist_ok=True)

def safe(root: pathlib.Path, name: str) -> pathlib.Path:
    if name == "":
        return root
    if name.startswith(("/", "\\")):
        raise SystemExit(f"unsafe archive member: {name!r}")
    target = (root / name).resolve()
    if target != root and root not in target.parents:
        raise SystemExit(f"unsafe archive member: {name!r}")
    return target

def extract_tar() -> None:
    with tarfile.open(archive) as source:
        names = [member.name for member in source.getmembers()]
        roots = {name.rstrip("/").split("/", 1)[0] for name in names if name.rstrip("/")}
        strip = next(iter(roots)) if len(roots) == 1 else ""
        regular = []
        links = []
        for member in source.getmembers():
            name = member.name[len(strip):].lstrip("/") if strip and member.name.startswith(strip) else member.name
            if member.isdir():
                safe(destination, name).mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                regular.append((member, name))
            elif member.issym() or member.islnk():
                links.append((member, name))
            else:
                raise SystemExit(f"unsupported runtime archive member: {member.name}")
        for member, name in regular:
            target = safe(destination, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = source.extractfile(member)
            if stream is None:
                raise SystemExit(f"cannot extract runtime member: {member.name}")
            with stream, target.open("wb") as output:
                shutil.copyfileobj(stream, output)
            target.chmod(member.mode & 0o777)
        for member, name in links:
            target = safe(destination, name)
            link_name = member.linkname
            if strip and link_name.startswith(strip + "/"):
                link_name = link_name[len(strip) + 1:]
            if link_name.startswith(("/", "\\")):
                raise SystemExit(f"unsafe runtime link: {member.name}")
            resolved = (target.parent / link_name).resolve()
            if destination not in resolved.parents and resolved != destination:
                raise SystemExit(f"unsafe runtime link: {member.name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(link_name)

def extract_zip() -> None:
    with zipfile.ZipFile(archive) as source:
        for member in source.infolist():
            target = safe(destination, member.filename)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(member) as input_stream, target.open("wb") as output:
                    shutil.copyfileobj(input_stream, output)

if tarfile.is_tarfile(archive):
    extract_tar()
elif zipfile.is_zipfile(archive):
    extract_zip()
else:
    raise SystemExit("ARCHIMATE_ARCHI_RUNTIME_ARCHIVE must be a zip or tar archive")

# A release archive is a ZIP container with one named bundle JAR. Reject all
# other files rather than silently installing a different bundle.
with zipfile.ZipFile(plugin) as source:
    files = [item.filename for item in source.infolist() if not item.is_dir()]
    jars = [name for name in files if pathlib.PurePosixPath(name).name.startswith("com.archimate.softwarefactory-") and name.endswith(".jar")]
    allowed = set(jars) | {"archi-plugin"}
    if len(jars) != 1 or any(name not in allowed for name in files):
        raise SystemExit("accepted archive must contain exactly one expected software-factory bundle JAR")
    dropins = home / ".archi" / "dropins"
    dropins.mkdir(parents=True, exist_ok=True)
    target = dropins / pathlib.PurePosixPath(jars[0]).name
    with source.open(jars[0]) as input_stream, target.open("wb") as output:
        shutil.copyfileobj(input_stream, output)
    target.chmod(0o644)
PY

launcher_relative="${ARCHIMATE_ARCHI_LAUNCHER_RELATIVE:-Archi}"
[[ "$launcher_relative" != /* && "$launcher_relative" != *..* ]] || {
  echo "ARCHIMATE_ARCHI_LAUNCHER_RELATIVE must stay inside the extracted runtime" >&2
  exit 64
}
launcher="$run_root/archi/$launcher_relative"
[[ -x "$launcher" ]] || { echo "pinned Archi launcher is missing or not executable" >&2; exit 69; }
# Archi's stock launcher reads these standard Eclipse switches; no smoke adapter
# switches are supported or passed.
printf '%s\n' "$launcher" > "$run_root/runtime/launcher-path"
printf '%s\n' "$run_root/fixture/$fixture_name" > "$run_root/runtime/fixture-path"
printf '%s\n' "$ARCHIMATE_ARCHI_VERSION" > "$run_root/runtime/archi-version"
printf '%s\n' "$ARCHIMATE_MEMGRAPH_IMAGE" > "$run_root/runtime/memgraph-image"
printf '%s\n' "$run_root/home" > "$run_root/runtime/home-path"
printf '%s\n' "$run_root/xdg-config" > "$run_root/runtime/xdg-config-path"
printf '%s\n' "$run_root/xdg-runtime" > "$run_root/runtime/xdg-runtime-path"
printf '%s\n' "$run_root/xdg-runtime/archimate-software-factory/agent-query-endpoint" > "$run_root/runtime/endpoint-path"
printf '%s\n' "-Duser.home=$run_root/home" >> "$run_root/archi/Archi.ini"
chmod 600 "$run_root/runtime"/*-path "$run_root/runtime/archi-version" "$run_root/runtime/memgraph-image"
rm -f -- "$runtime_archive"
