#!/usr/bin/env python3
"""Drive a release plug-in through stock Archi's public UI and read API.

The only Archi command-line options are stock Eclipse/Archi options. Project
creation, Memgraph provisioning, endpoint publication, and identity issuance
are all public UI operations. The one-time bearer value is read from the
public dialog and streamed directly to ``swamp vault put`` on stdin.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import signal
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, NoReturn, Sequence

tree: Any = None


def initialize_accessibility() -> None:
    """Import Dogtail only after stock Archi has registered on AT-SPI."""
    global tree
    from dogtail import config, tree as dogtail_tree

    config.config.logDebugToFile = False
    config.config.logDebugToStdOut = False
    config.config.searchCutoffCount = 10_000
    tree = dogtail_tree

TOKEN_PATTERN = re.compile(r"aq1\.[a-f0-9]{32}\.[A-Za-z0-9_-]{40,}")
ENDPOINT_PATTERN = re.compile(r"https?://[^\s,)]+")


class SmokeFailure(RuntimeError):
    """A prerequisite or live smoke assertion failed closed."""


def fail(message: str) -> NoReturn:
    raise SmokeFailure(message)


def safe_error_diagnostic(output: str) -> str:
    """Return only bounded Swamp error code/message fields, never raw output."""
    decoder = json.JSONDecoder()
    candidates: list[tuple[str, str]] = []
    for index, character in enumerate(output):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(output[index:])
        except json.JSONDecodeError:
            continue
        if not isinstance(value, dict):
            continue
        error = value.get("error")
        if isinstance(error, dict):
            code = error.get("code")
            message = error.get("message")
        else:
            code = value.get("code")
            message = error
        if isinstance(code, str) and isinstance(message, str):
            candidates.append((code, message))
    if not candidates:
        return "unknown Swamp error"
    code, message = candidates[-1]
    redacted = TOKEN_PATTERN.sub("<bearer>", message)
    redacted = ENDPOINT_PATTERN.sub("<endpoint>", redacted)
    redacted = " ".join(redacted.split())[:240]
    return f"{code}: {redacted}"[:300]


def run_command(args: Sequence[str], *, env: dict[str, str], stdin: Any = subprocess.DEVNULL,
                timeout: float | None = None, diagnostic: bool = False) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(list(args), env=env, stdin=stdin, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        fail(f"required command failed to start or timed out: {args[0]} ({error.__class__.__name__})")
    if result.returncode != 0:
        # Third-party output is intentionally not retained. A caller may opt
        # into one redacted diagnostic line for bounded smoke triage.
        operation = " ".join(str(value) for value in list(args)[:3])
        if diagnostic:
            detail = safe_error_diagnostic(result.stderr + "\n" + result.stdout)
            suffix = f": {detail}"
        else:
            suffix = ""
        fail(f"required command failed: {operation} (exit {result.returncode}){suffix}")
    return result


def read_required(path: pathlib.Path) -> str:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        fail(f"runtime metadata is unavailable: {path.name}")
    if not value:
        fail(f"runtime metadata is empty: {path.name}")
    return value


def json_result(output: str) -> dict[str, Any]:
    # The Swamp JSON renderer emits the final run as pretty-printed JSON, after
    # any one-line event records. Decode every complete object and retain only
    # the last one; do not persist or print the raw output.
    decoder = json.JSONDecoder()
    values: list[dict[str, Any]] = []
    for index, character in enumerate(output):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(output[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            values.append(value)
    completed = [
        value for value in values
        if isinstance(value.get("dataArtifacts"), list)
    ]
    if completed:
        # Prefer the completed run envelope over nested attribute objects in
        # pretty-printed JSON. Do not retain or inspect any artifact values here.
        return completed[-1]
    if values:
        return values[-1]
    fail("Swamp returned no machine-readable method result")


def collection_result_from_artifacts(
    payload: dict[str, Any],
    review_id: str,
    epoch: int,
    model_id: str,
) -> dict[str, Any]:
    """Extract the validated collection result from Swamp's completed run.

    Swamp's JSON renderer exposes method-written resources as dataArtifacts;
    method return fields are not part of the completed run envelope. Only the
    non-secret reviewState and evidenceManifest attributes are considered.
    """
    artifacts = payload.get("dataArtifacts")
    if not isinstance(artifacts, list):
        fail("collect_evidence completed run has no dataArtifacts")

    state_candidates: list[dict[str, Any]] = []
    manifest_candidates: list[dict[str, Any]] = []
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        name = artifact.get("name")
        attributes = artifact.get("attributes")
        if not isinstance(name, str) or not isinstance(attributes, dict):
            continue
        is_state = name.startswith("reviewState-") or (
            "phase" in attributes and "expectedGroups" in attributes and
            "selectedSpecialists" in attributes
        )
        is_manifest = name.startswith("evidenceManifest-") or (
            attributes.get("complete") is True and "chunkCount" in attributes and
            "counts" in attributes
        )
        if is_state:
            state_candidates.append(attributes)
        if is_manifest:
            manifest_candidates.append(attributes)

    if len(state_candidates) != 1:
        named = [artifact.get("name") for artifact in artifacts
                 if isinstance(artifact, dict) and isinstance(artifact.get("name"), str)]
        fail(
            "collect_evidence completed run has ambiguous or missing reviewState "
            f"(reviewState={len(state_candidates)}, names={','.join(named[:20]) or 'none'})",
        )
    if len(manifest_candidates) > 1:
        fail("collect_evidence completed run has ambiguous evidenceManifest artifacts")
    state = state_candidates[0]
    manifest = manifest_candidates[0] if manifest_candidates else None
    identity = (review_id, epoch, model_id)
    if (
        state.get("reviewId"), state.get("epoch"), state.get("modelId")
    ) != identity or state.get("phase") != "assessing":
        fail("collect_evidence reviewState identity or phase is inconsistent")
    state_revision = state.get("publishedRevision")
    if type(state_revision) is not int or state_revision < 1:
        fail("collect_evidence reviewState has no published revision")

    result: dict[str, Any] = {"revision": state_revision, "restarted": False}
    if manifest is None:
        return result
    if (
        (manifest.get("reviewId"), manifest.get("epoch"), manifest.get("modelId"))
        != identity
    ):
        fail("collect_evidence evidenceManifest identity is inconsistent")
    manifest_revision = manifest.get("publishedRevision")
    if type(manifest_revision) is not int or manifest_revision < 1 or state_revision != manifest_revision:
        fail("collect_evidence artifacts have inconsistent published revisions")
    if manifest.get("complete") is not True or type(manifest.get("chunkCount")) is not int or manifest["chunkCount"] < 1:
        fail("collect_evidence evidenceManifest is incomplete")
    counts = manifest.get("counts")
    if not isinstance(counts, dict) or set(counts) != {"folders", "elements", "relationships"}:
        fail("collect_evidence evidenceManifest counts are malformed")
    if any(type(counts[key]) is not int or counts[key] < 0 for key in counts):
        fail("collect_evidence evidenceManifest counts are invalid")
    result["counts"] = {key: counts[key] for key in ("folders", "elements", "relationships")}
    result["restarted"] = manifest.get("restarted") is True
    return result


def method(env: dict[str, str], repo: pathlib.Path, model: str, name: str,
           inputs: pathlib.Path | None = None) -> dict[str, Any]:
    args = ["swamp", "model", "method", "run", model, name, "--repo-dir", str(repo),
            "--json", "--skip-reports"]
    if inputs is not None:
        args.extend(["--input-file", str(inputs)])
    try:
        output = run_command(args, env=env, diagnostic=True).stdout
    except SmokeFailure as error:
        fail(f"Swamp review method failed: {name} ({error})")
    return json_result(output)


def write_input(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
    path.chmod(0o600)


def prepare_local_model_source(run_root: pathlib.Path, source_root: pathlib.Path) -> pathlib.Path:
    """Stage the exact model source with a literal export hint for local discovery."""
    staged = run_root / "model-source"
    target = staged / "extensions" / "models" / "architecture-development"
    shutil.copytree(source_root / "extensions" / "models" / "architecture-development", target)
    model_file = target / "architecture_review.ts"
    source = model_file.read_text(encoding="utf-8")
    expected = "export const model = { ...definition, methods: loggedMethods };"
    replacement = 'export const model = { type: "@keyrage/architecture-development/review", ...definition, methods: loggedMethods };'
    if expected not in source:
        fail("architecture review model export shape is unsupported")
    model_file.write_text(source.replace(expected, replacement, 1), encoding="utf-8")
    return staged


def wait_for(predicate, description: str, timeout: float = 60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            matches = tree.root.findChildren(predicate)
            for match in matches:
                if match.showing:
                    return match
        except Exception:
            pass
        time.sleep(0.25)
    raise SmokeFailure(f"timed out waiting for {description}")


def wait_until(predicate, description: str, timeout: float = 60) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.25)
    fail(f"timed out waiting for {description}")


def button(name: str, timeout: float = 30):
    return wait_for(lambda node: node.name == name and node.roleName in ("button", "push button"),
                    f"button {name!r}", timeout)


def click(node) -> None:
    if not node.showing or not node.sensitive:
        fail(f"widget is not operable: {node.roleName} {node.name!r}")
    if "click" in node.actions:
        node.doActionNamed("click")
        return
    x, y = node.position
    width, height = node.size
    run_command(["xdotool", "mousemove", str(x + width // 2), str(y + height // 2), "click", "1"],
                env=dict(os.environ))


def xdo(*args: str) -> None:
    run_command(["xdotool", *args], env=dict(os.environ))


def named(name: str, role: str | None = None, timeout: float = 60):
    return wait_for(lambda node: node.name.strip() == name and (role is None or node.roleName == role),
                    f"{role or 'widget'} {name!r}", timeout)


def select_path(path: pathlib.Path) -> None:
    xdo("key", "ctrl+l")
    time.sleep(0.5)
    xdo("type", "--delay", "1", str(path))
    time.sleep(0.5)
    xdo("key", "Return")


def application():
    initialize_accessibility()
    # AT-SPI reports the Eclipse application node as not showing while its
    # child shell is already mapped. Wait for the application node itself
    # rather than filtering it through the widget-level ``showing`` predicate.
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            matches = tree.root.findChildren(
                lambda node: node.roleName == "application" and node.name == "Archi")
            if matches:
                return matches[0]
        except Exception:
            pass
        time.sleep(0.25)
    fail("timed out waiting for Archi application")


def activate_menu(app, label: str) -> None:
    item = app.child(name=label, roleName="menu item")
    if not item.sensitive or "click" not in item.actions:
        fail(f"Software Factory menu contribution is not accessible: {label}")
    item.doActionNamed("click")


def setup_project(app, fixture: pathlib.Path, git_root: pathlib.Path, xdg_config: pathlib.Path) -> None:
    welcome = [node for node in app.findChildren(lambda node: node.name == "Welcome") if node.showing]
    if welcome:
        xdo("mousemove", "132", "94", "click", "1")
        time.sleep(2)
    activate_menu(app, "Create Software Factory Project...")
    named("Select ArchiMate Exchange bootstrap XML", "file chooser", 20)
    select_path(fixture)
    chooser = named("Select local Git working tree", "file chooser", 20)
    places = chooser.child(name="Places", roleName="scroll pane").child(roleName="viewport").child(roleName="list box")
    bookmark = next((node for node in places.children if node.description == str(git_root)), None)
    if bookmark is None:
        fail("the run-scoped Git directory was not exposed as a public chooser bookmark")
    click(bookmark)
    open_button = chooser.child(name="Open", roleName="button")
    wait_until(lambda: open_button.sensitive, "Git folder selection", 10)
    click(open_button)
    def ui_nodes(predicate):
        return app.findChildren(predicate) + tree.root.findChildren(predicate)

    def working_copy_ready() -> bool:
        failures = ui_nodes(lambda node: node.name.strip() in ("Project setup failed", "Project setup error"))
        if failures:
            # The UI error text may contain third-party command diagnostics; retain
            # only the safe public failure title and let cleanup handle the run.
            fail("public project setup reported failure")
        return bool(list(git_root.glob("*.archimate")))

    try:
        wait_until(working_copy_ready, "created Archi working copy", 150)
    except SmokeFailure as error:
        if str(error) == "public project setup reported failure":
            raise
        dialogs = ui_nodes(lambda node: node.roleName in ("dialog", "alert"))
        titles = sorted({node.name.strip() for node in dialogs if node.name.strip()})
        fail("timed out waiting for working copy (accessible dialogs: "
             + (", ".join(titles) or "none") + ")")
    # Docker-backed public setup can take longer than working-copy creation on
    # a cold but pinned runtime; keep waiting within the existing run timeout.
    def setup_complete() -> bool:
        matches = ui_nodes(
            lambda candidate: candidate.roleName in ("dialog", "alert")
            and candidate.name.strip() == "ArchiMate Software Factory"
        )
        if matches:
            return True
        # Some SWT/Linux combinations close the completion shell immediately;
        # the supported public status trim remains the authoritative result.
        status = ui_nodes(lambda candidate: candidate.roleName == "label"
                          and candidate.name.strip() == "Software Factory: Synchronized")
        if status:
            return True
        unexpected = ui_nodes(
            lambda candidate: candidate.showing and candidate.roleName in ("dialog", "alert")
            and candidate.name.strip() not in ("ArchiMate Software Factory", "Select local Git working tree")
        )
        if unexpected:
            titles = ", ".join(sorted({candidate.name.strip() for candidate in unexpected if candidate.name}))
            fail(f"public project setup exposed an unexpected dialog: {titles or 'untitled'}")
        return False

    try:
        wait_until(setup_complete, "ArchiMate Software Factory", timeout=120)
    except SmokeFailure:
        dialogs = ui_nodes(lambda node: node.roleName in ("dialog", "alert"))
        titles = sorted({node.name.strip() for node in dialogs if node.name.strip()})
        fail("timed out waiting for setup completion (accessible dialogs: "
             + (", ".join(titles) or "none") + ")")
    complete = next(iter(ui_nodes(
        lambda node: node.roleName in ("dialog", "alert")
        and node.name.strip() == "ArchiMate Software Factory"
    )), None)
    labels = ("\n".join(node.name for node in complete.findChildren(lambda n: n.roleName == "label"))
              if complete is not None else "Software Factory: Synchronized")
    if "State: Synchronized" not in labels and "Software Factory: Synchronized" not in labels:
        fail("public project setup did not report Synchronized")
    if complete is not None:
        click(button("OK"))
    status = wait_for(lambda n: n.roleName == "label" and n.name == "Software Factory: Synchronized",
                      "synchronized status", 30)
    if status.size[0] < len(status.name) * 5:
        fail("synchronized status is clipped in the pinned desktop layout")
    # Keep config parsing separate from the UI path; this only records cleanup
    # identities and never reads or prints username/password properties.
    config_dir = xdg_config / "Archi" / "archimate-software-factory" / "projects"
    configs = list(config_dir.glob("*.properties"))
    if len(configs) != 1:
        fail("public project setup did not create exactly one isolated configuration")
    container = volume = None
    for raw in configs[0].read_bytes().splitlines():
        if raw.startswith(b"containerName="):
            container = raw.split(b"=", 1)[1].decode("iso-8859-1")
        elif raw.startswith(b"volumeName="):
            volume = raw.split(b"=", 1)[1].decode("iso-8859-1")
    if not container or not volume or not re.fullmatch(r"archimate-factory-[A-Za-z0-9_-]+", container):
        fail("project setup did not expose safe cleanup identities")
    return container, volume


def issue_identity(app) -> str:
    activate_menu(app, "Manage Agent Query Access...")
    named("Manage Agent Query Access", timeout=20)
    click(button("Issue Identity..."))
    dialog = named("Issue Agent Query Identity", timeout=15)
    fields = [node for node in dialog.findChildren(lambda n: n.showing and n.roleName in ("text", "password text"))]
    if not fields:
        fail("public identity dialog has no accessible display-name field")
    click(fields[0])
    xdo("key", "ctrl+a")
    xdo("type", "--delay", "1", "architecture-development live smoke")
    wait_until(lambda: fields[0].text == "architecture-development live smoke",
               "identity display name", 10)
    xdo("key", "Tab")
    ok_candidates = dialog.findChildren(lambda node: node.name == "OK"
                                        and node.roleName in ("button", "push button"))
    if not ok_candidates:
        fail("identity input dialog has no accessible OK action")
    click(ok_candidates[0])
    # SWT opens the one-time shell as a sibling of the original dialog; refresh
    # the AT-SPI application proxy before searching for that shell.
    app = application()
    deadline = time.monotonic() + 20
    token_dialog = None
    match = None
    while time.monotonic() < deadline:
        candidates = app.findChildren(lambda n: n.name == "Copy Bearer Token Now")
        visible: list[str] = []
        for node in app.findChildren(lambda n: n.roleName in
                                     ("label", "text", "entry", "password text")):
            visible.append(node.name)
            if node.roleName in ("text", "entry", "password text"):
                try:
                    visible.append(node.queryText().getText(0, -1))
                except Exception:
                    pass
        match = TOKEN_PATTERN.search("\n".join(visible))
        if match:
            token_dialog = candidates[0] if candidates else app
            break
        time.sleep(0.25)
    if token_dialog is None or match is None:
        safe_dialogs = []
        for node in app.findChildren(lambda n: n.name == "Copy Bearer Token Now"):
            safe_names = []
            for child in node.findChildren(lambda n: n.showing):
                value = n.name if (n := child).name else ""
                safe_names.append("<token>" if TOKEN_PATTERN.fullmatch(value) else value[:80])
            safe_dialogs.append(f"{node.roleName}:{node.name!r}[{','.join(safe_names[:12])}]")
        fail("public identity dialog did not expose a one-time bearer identity (dialogs: "
             + ("; ".join(safe_dialogs) or "none") + ")")
    token = match.group(0)
    # Dismiss the one-time display before any evidence is retained. Do not use
    # the clipboard: the token remains only in this process until vault stdin.
    xdo("key", "Escape")
    wait_until(lambda: not token_dialog.showing, "one-time token dialog dismissal", 10)
    access = named("Manage Agent Query Access", timeout=10)
    xdo("key", "Escape")
    wait_until(lambda: not access.showing, "identity administration dialog dismissal", 10)
    return token


def select_model_id(config_dir: pathlib.Path, expected: str, git_root: pathlib.Path) -> str:
    """Read only the public project's modelId, never credentials or other values."""
    configs = list(config_dir.glob("*.properties"))
    if len(configs) != 1:
        fail("public project setup did not create exactly one isolated configuration")
    model_id = ""
    configured_git_root = ""
    for raw in configs[0].read_bytes().splitlines():
        if raw.startswith(b"modelId="):
            model_id = raw.split(b"=", 1)[1].decode("iso-8859-1").strip()
        elif raw.startswith(b"gitRoot="):
            configured_git_root = raw.split(b"=", 1)[1].decode("iso-8859-1").replace("\\\\", "\\").strip()
    if not model_id or configured_git_root != str(git_root):
        fail("public project configuration did not expose a valid model identity")
    if model_id != expected:
        return model_id
    return expected


def public_discovery(endpoint: str, token: str, model_id: str) -> dict[str, Any]:
    """Read and retain only safe fields from the public v1 discovery response."""
    route = endpoint.rstrip("/")
    if not route.endswith("/agent-query/v1"):
        route += "/agent-query/v1"
    url = route + "?" + urllib.parse.urlencode({"modelId": model_id})
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            status = int(response.status)
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        fail(f"public v1 discovery failed (HTTP {int(error.code)})")
    except Exception as error:
        fail(f"public v1 discovery failed ({error.__class__.__name__})")
    if not isinstance(payload, dict):
        fail("public v1 discovery returned an invalid envelope")
    model = payload.get("model") if isinstance(payload.get("model"), dict) else {}
    canonical = model.get("canonicalId")
    capabilities = payload.get("capabilities")
    limits = payload.get("limits")
    revision = payload.get("publishedRevision")
    if status != 200 or payload.get("apiVersion") != "v1" or payload.get("graphContractVersion") != 2:
        fail("public v1 discovery contract is incompatible")
    if canonical != model_id or not isinstance(revision, int) or revision < 1:
        fail("public v1 discovery model identity or revision is inconsistent")
    if not isinstance(capabilities, list) or not all(isinstance(item, str) for item in capabilities):
        fail("public v1 discovery capabilities are malformed")
    if not isinstance(limits, dict):
        fail("public v1 discovery limits are malformed")
    return {"httpStatus": status, "apiVersion": payload["apiVersion"],
            "graphContractVersion": payload["graphContractVersion"], "publishedRevision": revision,
            "modelCanonicalId": canonical, "capabilities": capabilities, "limits": limits}


def wait_for_endpoint(path: pathlib.Path, process: subprocess.Popen[bytes]) -> str:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            fail("stock Archi exited before endpoint publication")
        if path.is_file():
            value = read_required(path)
            parsed = urllib.parse.urlparse(value)
            if (parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and parsed.port
                    and not parsed.query and not parsed.fragment):
                return value
            fail("published endpoint is outside the loopback v1 boundary")
        time.sleep(0.25)
    fail("public setup did not publish a loopback endpoint")


def vault_put(env: dict[str, str], repo: pathlib.Path, token: str) -> None:
    process = subprocess.Popen(
        ["swamp", "vault", "put", "live-smoke-vault", "ARCHI_BEARER_TOKEN",
         "--repo-dir", str(repo), "--json", "--quiet"],
        env=env, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        assert process.stdin is not None
        process.stdin.write((token + "\n").encode("utf-8"))
        process.stdin.close()
        token = ""
        if process.wait(timeout=60) != 0:
            fail("Swamp vault rejected the one-time bearer identity")
    except (BrokenPipeError, OSError, subprocess.TimeoutExpired) as error:
        process.kill()
        fail(f"one-time bearer identity could not be streamed to the vault ({error.__class__.__name__})")


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: live_smoke_driver.py RUN_ROOT SOURCE_ROOT", file=sys.stderr)
        return 64
    run_root = pathlib.Path(sys.argv[1]).resolve()
    source_root = pathlib.Path(sys.argv[2]).resolve()
    if not run_root.is_dir() or not source_root.is_dir():
        print("live smoke roots are unavailable", file=sys.stderr)
        return 64
    if not (run_root / "archive" / "plugin.archiplugin").is_file():
        print("verified plugin archive is unavailable", file=sys.stderr)
        return 64

    archi: subprocess.Popen[bytes] | None = None
    openbox: subprocess.Popen[bytes] | None = None
    try:
        launcher = pathlib.Path(read_required(run_root / "runtime" / "launcher-path"))
        fixture = pathlib.Path(read_required(run_root / "runtime" / "fixture-path"))
        endpoint_path = pathlib.Path(read_required(run_root / "runtime" / "endpoint-path"))
        home = pathlib.Path(read_required(run_root / "runtime" / "home-path"))
        xdg_config = pathlib.Path(read_required(run_root / "runtime" / "xdg-config-path"))
        xdg_runtime = pathlib.Path(read_required(run_root / "runtime" / "xdg-runtime-path"))
        if not launcher.is_file() or not os.access(launcher, os.X_OK) or not fixture.is_file():
            fail("stock Archi runtime or Exchange fixture is unavailable")
        git_root = run_root / "git"
        git_root.mkdir(mode=0o700)
        run_command(["git", "init", "--quiet", str(git_root)], env=dict(os.environ))
        (xdg_config / "gtk-3.0").mkdir(parents=True, exist_ok=True)
        (xdg_config / "gtk-3.0" / "bookmarks").write_text(
            f"file://{git_root} Architecture-development-live-smoke\n", encoding="utf-8")
        common_env = dict(os.environ)
        common_env.update({
            "HOME": str(home), "XDG_CONFIG_HOME": str(xdg_config),
            "XDG_DATA_HOME": str(run_root / "xdg-data"), "XDG_STATE_HOME": str(run_root / "xdg-state"),
            "XDG_CACHE_HOME": str(run_root / "xdg-cache"), "XDG_RUNTIME_DIR": str(xdg_runtime),
            "SWAMP_REPO_DIR": str(run_root / "swamp"), "PYTHONUNBUFFERED": "1",
        })
        common_env.pop("ARCHIMATE_FACTORY_PLUGIN", None)
        common_env.pop("ARCHIMATE_FACTORY_PLUGIN_SHA256", None)
        # Snapshot plugin-owned names before public setup. This is cleanup
        # bookkeeping only; the plug-in remains the sole creator/owner.
        for resource, args in (("containers", ["docker", "ps", "-a", "--format", "{{.Names}}"]),
                               ("volumes", ["docker", "volume", "ls", "--format", "{{.Name}}"])):
            snapshot = run_command(args, env=common_env).stdout
            (run_root / "runtime" / f"docker-before-{resource}").write_text(snapshot, encoding="utf-8")
        openbox = subprocess.Popen(["openbox"], env=common_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Stock Archi accepts only documented Eclipse/Archi switches here.
        archi = subprocess.Popen([str(launcher), "-clean", "-consoleLog", "-nosplash"],
                                 env=common_env, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        (run_root / "runtime" / "archi-pid").write_text(str(archi.pid), encoding="utf-8")
        # Match the sibling public UAT runner: allow SWT and the plug-in menu
        # contribution to register on AT-SPI before the first menu action.
        time.sleep(12)
        app = application()
        container, volume = setup_project(app, fixture, git_root, xdg_config)
        model_id = select_model_id(xdg_config / "Archi" / "archimate-software-factory" / "projects",
                                   "live-smoke-model", git_root)
        if os.environ.get("ARCHIMATE_SMOKE_SETUP_ONLY") == "1":
            return 0
        (run_root / "runtime" / "docker-name").write_text(container, encoding="utf-8")
        (run_root / "runtime" / "docker-volumes").write_text(
            f"{volume}\n{container}-config\n{container}-logs\n", encoding="utf-8")
        endpoint = wait_for_endpoint(endpoint_path, archi)
        token = issue_identity(app)
        discovery = public_discovery(endpoint, token, model_id)

        repo = run_root / "swamp"
        run_command(["swamp", "repo", "init", str(repo), "--tool", "none", "--json"], env=common_env)
        local_source = prepare_local_model_source(run_root, source_root)
        run_command(["swamp", "extension", "source", "add", str(local_source), "--only", "models",
                     "--repo-dir", str(repo), "--json"], env=common_env)
        run_command(["swamp", "extension", "trust", "add", "keyrage", "--repo-dir", str(repo), "--json"], env=common_env)
        run_command(["swamp", "vault", "create", "local_encryption", "live-smoke-vault",
                     "--repo-dir", str(repo), "--json"], env=common_env)
        vault_put(common_env, repo, token)
        del token
        run_command(["swamp", "model", "create", "@keyrage/architecture-development/review", "live-smoke-review",
                     "--repo-dir", str(repo), "--json", "--global-arg", f"modelId={model_id}",
                     "--global-arg", f"endpointFile={endpoint_path}", "--global-arg",
                     "bearerToken=${{ vault.get('live-smoke-vault', 'ARCHI_BEARER_TOKEN') }}"], env=common_env)

        evidence: dict[str, Any] = {"boundary": "public-v1-read-only", "modelId": model_id,
                                    "endpoint": "loopback-redacted", "artifact": "accepted-archiplugin-copy-verified",
                                    "discovery": discovery, "methods": []}
        start = run_root / "evidence" / "start.json"
        write_input(start, {"reviewId": "live-smoke", "expectedGroups": ["Application", "Technology"]})
        method(common_env, repo, "live-smoke-review", "start_review", start)
        evidence["methods"].append("start_review")
        identity = run_root / "evidence" / "identity.json"
        write_input(identity, {"reviewId": "live-smoke", "epoch": 1})
        collection = method(common_env, repo, "live-smoke-review", "collect_evidence", identity)
        evidence["methods"].append("collect_evidence")
        collection_result = collection_result_from_artifacts(
            collection, "live-smoke", 1, model_id,
        )
        revision = collection_result["revision"]
        roles = ["completeness", "crossLayerTraceability", "documentationClarity", "motivationStrategy",
                 "repositoryAlignment", "derivedRelationships"]
        assessments = [{"specialist": role, "modelId": model_id, "publishedRevision": revision,
                        "findings": [{"findingId": f"live-{role}", "category": "observation",
                                      "title": f"{role} smoke finding",
                                      "statement": "The complete fixture was read through the public v1 boundary.",
                                      "canonicalIds": ["id-acc6b7a765814bf79f6232fedc8b5e9b"],
                                      "citations": [{"canonicalId": "id-acc6b7a765814bf79f6232fedc8b5e9b"}],
                                      "impact": 3, "confidence": 4, "scope": 2, "effort": 2}],
                        "strengths": [f"{role} executed against one published revision"],
                        "completedAt": "2026-01-01T00:00:00.000Z"} for role in roles]
        assessments_path = run_root / "evidence" / "assessments.json"
        write_input(assessments_path, {"reviewId": "live-smoke", "epoch": 1, "assessments": assessments})
        method(common_env, repo, "live-smoke-review", "record_assessments", assessments_path)
        evidence["methods"].append("record_assessments")
        synthesis = {"reviewId": "live-smoke", "epoch": 1, "modelId": model_id,
                     "publishedRevision": revision, "sourceFindingIds": [f"live-{role}" for role in roles],
                     "strengths": ["Public read-only review boundary completed."], "recommendations": [{
                         "recommendationId": "recommendation-live-completeness", "title": "Document the fixture boundary",
                         "statement": "Keep the public read boundary documented for this model.",
                         "sourceFindingIds": [f"live-{role}" for role in roles], "citations": [{"canonicalId": "id-acc6b7a765814bf79f6232fedc8b5e9b"}],
                         "impact": 3, "confidence": 4, "scope": 2, "effort": 2, "score": 36,
                         "scoreExplanation": "recomputed by the extension"}], "synthesizedAt": "2026-01-01T00:00:00.000Z"}
        synthesis_path = run_root / "evidence" / "synthesis.json"
        write_input(synthesis_path, {"reviewId": "live-smoke", "epoch": 1, "synthesis": synthesis})
        method(common_env, repo, "live-smoke-review", "record_synthesis", synthesis_path)
        evidence["methods"].append("record_synthesis")
        followup = run_root / "evidence" / "followup.json"
        write_input(followup, {"reviewId": "live-smoke", "epoch": 1, "sequence": 1,
                              "recommendationId": "recommendation-live-completeness", "specialist": "completeness",
                              "question": "Why is this a useful smoke finding?",
                              "response": "It proves the selected specialist and synthesis path ran."})
        method(common_env, repo, "live-smoke-review", "record_followup", followup)
        evidence["methods"].append("record_followup")
        disposition = run_root / "evidence" / "disposition.json"
        write_input(disposition, {"reviewId": "live-smoke", "epoch": 1,
                                  "recommendationId": "recommendation-live-completeness", "disposition": "undecided",
                                  "rationale": "Live smoke does not approve model changes."})
        method(common_env, repo, "live-smoke-review", "disposition", disposition)
        evidence["methods"].append("disposition")
        evidence["revision"] = revision
        (run_root / "evidence" / "redacted-summary.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(evidence, separators=(",", ":")))
        return 0
    except SmokeFailure as error:
        print(f"live smoke failed closed: {error}", file=sys.stderr)
        return 69
    finally:
        if archi is not None:
            try:
                archi.terminate()
            except OSError:
                pass
        if openbox is not None:
            try:
                openbox.terminate()
            except OSError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
