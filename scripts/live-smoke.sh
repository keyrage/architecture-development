#!/usr/bin/env bash
set -euo pipefail

# Admit exactly one immutable release archive. Development JARs and mutable build
# outputs are intentionally not accepted by the live smoke.
: "${ARCHIMATE_FACTORY_PLUGIN:?Set ARCHIMATE_FACTORY_PLUGIN to one accepted .archiplugin}"
: "${ARCHIMATE_FACTORY_PLUGIN_SHA256:?Set ARCHIMATE_FACTORY_PLUGIN_SHA256 to its SHA-256}"
[[ "$ARCHIMATE_FACTORY_PLUGIN" == *.archiplugin ]] || {
  echo "ARCHIMATE_FACTORY_PLUGIN must be an accepted .archiplugin archive" >&2
  exit 64
}
[[ "$ARCHIMATE_FACTORY_PLUGIN_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || {
  echo "ARCHIMATE_FACTORY_PLUGIN_SHA256 must be a SHA-256" >&2
  exit 64
}
[[ -f "$ARCHIMATE_FACTORY_PLUGIN" && ! -L "$ARCHIMATE_FACTORY_PLUGIN" ]] || {
  echo "ARCHIMATE_FACTORY_PLUGIN must be one regular file" >&2
  exit 64
}

run_root="$(mktemp -d "${TMPDIR:-/tmp}/architecture-development-smoke.XXXXXX")"
chmod 700 "$run_root"
cleanup() {
  local status=$? cleanup_status=0 name
  set +e
  if [[ -f "$run_root/runtime/archi-pid" ]]; then
    kill "$(cat "$run_root/runtime/archi-pid")" 2>/dev/null || true
  fi
  if command -v docker >/dev/null 2>&1; then
    if [[ -f "$run_root/runtime/docker-name" ]]; then
      docker rm --volumes --force "$(cat "$run_root/runtime/docker-name")" >/dev/null 2>&1 || true
    fi
    if [[ -f "$run_root/runtime/docker-volumes" ]]; then
      while IFS= read -r name; do
        [[ -n "$name" ]] && docker volume rm --force "$name" >/dev/null 2>&1 || true
      done < "$run_root/runtime/docker-volumes"
    fi
    # If UI setup failed before its configuration was readable, remove only
    # newly-created plug-in resources, never names present before this run.
    for resource in containers volumes; do
      before="$run_root/runtime/docker-before-$resource"
      [[ -f "$before" ]] || continue
      if [[ "$resource" == containers ]]; then
        while IFS= read -r name; do
          [[ "$name" == archimate-factory-* ]] || continue
          grep -Fxq -- "$name" "$before" && continue
          docker rm --volumes --force "$name" >/dev/null 2>&1 || true
        done < <(docker ps -a --format '{{.Names}}')
      else
        while IFS= read -r name; do
          [[ "$name" == archimate-factory-* ]] || continue
          grep -Fxq -- "$name" "$before" && continue
          docker volume rm --force "$name" >/dev/null 2>&1 || true
        done < <(docker volume ls --format '{{.Name}}')
      fi
    done
  fi
  if [[ -f "$run_root/runtime/docker-name" ]] && docker inspect "$(cat "$run_root/runtime/docker-name")" >/dev/null 2>&1; then
    cleanup_status=70
  fi
  if [[ -f "$run_root/runtime/docker-volumes" ]]; then
    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      docker volume inspect "$name" >/dev/null 2>&1 && cleanup_status=70
    done < "$run_root/runtime/docker-volumes"
  fi
  rm -rf -- "$run_root"
  (( status != 0 )) && exit "$status"
  (( cleanup_status != 0 )) && {
    echo "live smoke cleanup did not remove all plugin-owned Docker resources" >&2
    exit "$cleanup_status"
  }
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
mkdir -p "$run_root/archive"
cp -- "$ARCHIMATE_FACTORY_PLUGIN" "$run_root/archive/plugin.archiplugin"
printf '%s  %s\n' "$ARCHIMATE_FACTORY_PLUGIN_SHA256" "$run_root/archive/plugin.archiplugin" | sha256sum --check --status - || {
  echo "accepted plugin checksum mismatch" >&2
  exit 65
}
printf '%s\n' "$ARCHIMATE_FACTORY_PLUGIN_SHA256" > "$run_root/archive/plugin.sha256"
chmod 600 "$run_root/archive/plugin.archiplugin" "$run_root/archive/plugin.sha256"
unset ARCHIMATE_FACTORY_PLUGIN ARCHIMATE_FACTORY_PLUGIN_SHA256

script_dir="$(cd "$(dirname "$0")" && pwd)"
"$script_dir/provision-live-smoke-runtime.sh" "$run_root" "$(cd "$script_dir/.." && pwd)"
# The UI runner starts stock Archi under a disposable D-Bus/X11 session. No
# command-line adapter arguments are passed to Archi.
dbus-run-session -- bash -eu -c '
  gsettings set org.gnome.desktop.interface toolkit-accessibility true
  [[ "$(gsettings get org.gnome.desktop.interface toolkit-accessibility)" == "true" ]]
  exec xvfb-run -a --server-args="-screen 0 1440x900x24 -ac" \
    env GSETTINGS_BACKEND=keyfile GTK_A11Y=always GTK_MODULES=gail:atk-bridge NO_AT_BRIDGE=0 GDK_BACKEND=x11 \
    python3 "$1" "$2" "$3"
' bash "$script_dir/../smoke/live_smoke_driver.py" "$run_root" "$(cd "$script_dir/.." && pwd)"
