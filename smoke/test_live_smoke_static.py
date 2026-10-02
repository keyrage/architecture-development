#!/usr/bin/env python3
"""Focused fail-closed checks for the live-smoke boundary."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import re
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
_SPEC = importlib.util.spec_from_file_location("live_smoke_driver", ROOT / "smoke/live_smoke_driver.py")
assert _SPEC is not None and _SPEC.loader is not None
_DRIVER = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_DRIVER)


class LiveSmokeBoundaryTest(unittest.TestCase):
    def test_stock_launcher_has_no_adapter_arguments(self) -> None:
        source = (ROOT / "smoke/live_smoke_driver.py").read_text(encoding="utf-8")
        self.assertNotRegex(source, r"--smoke-(?:plugin|fixture|memgraph|endpoint)")
        self.assertIn('"-clean", "-consoleLog", "-nosplash"', source)

    def test_only_release_archiplugin_is_admitted(self) -> None:
        source = (ROOT / "scripts/live-smoke.sh").read_text(encoding="utf-8")
        self.assertIn('ARCHIMATE_FACTORY_PLUGIN" == *.archiplugin', source)
        self.assertNotIn("approved_dev_jar", source)

    def test_fixture_is_schema_complete_exchange_with_expected_groups(self) -> None:
        root = ET.parse(ROOT / "smoke/fixtures/review-model-exchange.xml").getroot()
        self.assertEqual(root.tag, "{http://www.opengroup.org/xsd/archimate/3.0/}model")
        self.assertIn("{http://www.w3.org/2001/XMLSchema-instance}schemaLocation", root.attrib)
        self.assertEqual(root.attrib["identifier"], "live-smoke-model")
        self.assertIsNotNone(root.find("{*}elements/{*}element[@xsi:type='ApplicationComponent']", {
            "xsi": "http://www.w3.org/2001/XMLSchema-instance"}))
        self.assertIsNotNone(root.find("{*}elements/{*}element[@xsi:type='TechnologyInterface']", {
            "xsi": "http://www.w3.org/2001/XMLSchema-instance"}))
        labels = {node.findtext("{*}label") for node in root.findall("{*}organizations/{*}item")}
        self.assertTrue({"Application", "Technology & Physical", "Relations"}.issubset(labels))
        self.assertGreaterEqual(len(root.findall("{*}relationships/{*}relationship")), 6)

    def test_control_fixture_preserves_supported_demonstrator_shape(self) -> None:
        root = ET.parse(ROOT / "smoke/fixtures/control-model-exchange.xml").getroot()
        self.assertEqual(root.attrib["identifier"], "task22-model")
        self.assertIn("{http://www.w3.org/2001/XMLSchema-instance}schemaLocation", root.attrib)
        self.assertEqual({node.findtext("{*}label") for node in root.findall("{*}organizations/{*}item")},
                         {"Application", "Technology & Physical", "Relations", "Views"})

    def test_dogtail_is_initialized_after_archi_launch(self) -> None:
        source = (ROOT / "smoke/live_smoke_driver.py").read_text(encoding="utf-8")
        self.assertIn("def initialize_accessibility", source)
        self.assertIn("initialize_accessibility()", source)
        self.assertNotIn("from dogtail import config, tree\n", source)

    def test_diagnostic_keeps_only_redacted_error_fields(self) -> None:
        token = "aq1." + "a" * 32 + "." + "b" * 40
        raw = json.dumps({"error": {"code": "method_execution_failed",
                                      "message": f"failed at https://127.0.0.1:1234/x with {token}"}})
        diagnostic = _DRIVER.safe_error_diagnostic(raw + "\nraw secret should not survive")
        self.assertEqual(diagnostic, "method_execution_failed: failed at <endpoint> with <bearer>")
        self.assertNotIn(token, diagnostic)
        self.assertNotIn("raw secret", diagnostic)

    def test_model_id_selection_reads_only_project_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_dir = pathlib.Path(directory) / "projects"
            git_root = pathlib.Path(directory) / "git"
            config_dir.mkdir()
            git_root.mkdir()
            (config_dir / "smoke.properties").write_bytes(
                b"modelId=actual-model\n"
                + f"gitRoot={git_root}\nusername=ignored\npassword=ignored\n".encode("utf-8"))
            self.assertEqual(_DRIVER.select_model_id(config_dir, "expected-model", git_root), "actual-model")

    def test_json_result_selects_completed_run_envelope(self) -> None:
        rendered = json.dumps({
            "status": "succeeded",
            "dataArtifacts": [{"name": "evidenceManifest-r-e1-s0", "attributes": {"x": 1}}],
            "globalArguments": {"modelId": "m"},
            "methodArguments": {"reviewId": "r"},
        }, indent=2)
        result = _DRIVER.json_result(rendered)
        self.assertIn("dataArtifacts", result)
        self.assertEqual(result["status"], "succeeded")

    def test_collection_result_reads_manifest_and_state_artifacts(self) -> None:
        completed = {
            "status": "succeeded",
            "dataArtifacts": [
                {
                    "name": "reviewState-live-smoke-e1-s0",
                    "attributes": {
                        "reviewId": "live-smoke", "epoch": 1,
                        "phase": "assessing", "modelId": "actual-model",
                        "publishedRevision": 7,
                    },
                },
                {
                    "name": "evidenceChunk-live-smoke-e1-s0",
                    "attributes": {"reviewId": "live-smoke", "modelId": "actual-model"},
                },
                {
                    "name": "evidenceManifest-live-smoke-e1-s0",
                    "attributes": {
                        "reviewId": "live-smoke", "epoch": 1,
                        "modelId": "actual-model", "publishedRevision": 7,
                        "complete": True, "chunkCount": 3,
                        "counts": {"folders": 1, "elements": 2, "relationships": 1},
                        "restarted": False,
                        "bearerToken": "must-not-be-read",
                    },
                },
            ],
        }
        self.assertEqual(
            _DRIVER.collection_result_from_artifacts(
                completed, "live-smoke", 1, "actual-model",
            ),
            {"revision": 7, "counts": {"folders": 1, "elements": 2, "relationships": 1},
             "restarted": False},
        )

    def test_collection_result_accepts_validated_state_when_manifest_is_not_exposed(self) -> None:
        completed = {"dataArtifacts": [{"name": "reviewState-r-e1-s0", "attributes": {
            "reviewId": "r", "epoch": 1, "modelId": "m", "phase": "assessing",
            "publishedRevision": 9}}]}
        self.assertEqual(
            _DRIVER.collection_result_from_artifacts(completed, "r", 1, "m"),
            {"revision": 9, "restarted": False},
        )

    def test_collection_result_rejects_ambiguous_or_inconsistent_artifacts(self) -> None:
        base = {
            "dataArtifacts": [
                {"name": "reviewState-live-smoke-e1-s0", "attributes": {
                    "reviewId": "live-smoke", "epoch": 1, "modelId": "actual-model",
                    "phase": "assessing", "publishedRevision": 7}},
                {"name": "evidenceManifest-live-smoke-e1-s0", "attributes": {
                    "reviewId": "live-smoke", "epoch": 1, "modelId": "actual-model",
                    "publishedRevision": 7, "complete": True, "chunkCount": 1,
                    "counts": {"folders": 0, "elements": 1, "relationships": 0},
                    "restarted": False}},
            ],
        }
        self.assertEqual(_DRIVER.collection_result_from_artifacts(base, "live-smoke", 1, "actual-model")["revision"], 7)
        ambiguous = {**base, "dataArtifacts": base["dataArtifacts"] + [base["dataArtifacts"][1]]}
        with self.assertRaises(_DRIVER.SmokeFailure):
            _DRIVER.collection_result_from_artifacts(ambiguous, "live-smoke", 1, "actual-model")
        inconsistent = json.loads(json.dumps(base))
        inconsistent["dataArtifacts"][1]["attributes"]["publishedRevision"] = 8
        with self.assertRaises(_DRIVER.SmokeFailure):
            _DRIVER.collection_result_from_artifacts(inconsistent, "live-smoke", 1, "actual-model")

    def test_collection_result_does_not_return_credential_fields(self) -> None:
        payload = {"dataArtifacts": [
            {"name": "reviewState-r-e1-s0", "attributes": {
                "reviewId": "r", "epoch": 1, "modelId": "m", "phase": "assessing", "publishedRevision": 1}},
            {"name": "evidenceManifest-r-e1-s0", "attributes": {
                "reviewId": "r", "epoch": 1, "modelId": "m", "publishedRevision": 1,
                "complete": True, "chunkCount": 1,
                "counts": {"folders": 0, "elements": 1, "relationships": 0},
                "bearerToken": "secret"}},
        ]}
        result = _DRIVER.collection_result_from_artifacts(payload, "r", 1, "m")
        self.assertNotIn("bearerToken", json.dumps(result))

    def test_token_is_not_an_environment_or_argument_contract(self) -> None:
        source = (ROOT / "smoke/live_smoke_driver.py").read_text(encoding="utf-8")
        self.assertIn("process.stdin.write", source)
        self.assertNotIn("ARCHI_BEARER_TOKEN=", source)
        self.assertNotRegex(source, r"vault put[^\n]*\$token")

    def test_dropins_and_top_level_normalization_are_present(self) -> None:
        source = (ROOT / "scripts/provision-live-smoke-runtime.sh").read_text(encoding="utf-8")
        self.assertIn('strip = next(iter(roots)) if len(roots) == 1 else ""', source)
        self.assertIn('home / ".archi" / "dropins"', source)
        self.assertIn("len(jars) != 1", source)


if __name__ == "__main__":
    unittest.main()
