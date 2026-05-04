import json
import shutil
import sys
import unittest
import asyncio
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import worker_api


class WorkerApiTests(unittest.TestCase):
    TEST_DIR = Path(__file__).resolve().parent

    def tearDown(self):
        for path in self.TEST_DIR.glob("_tmp_worker_*"):
            if path.is_file():
                path.unlink()
        relative_dir = PROJECT_ROOT / "_tmp_worker_relative"
        if relative_dir.exists():
            shutil.rmtree(relative_dir)

    def test_normalize_status_event_keeps_scraper_delivery_as_exporting(self):
        event = {"status": "delivered", "message": "Scraper job completed."}

        normalized = worker_api._normalize_status_event(event, "job-123")

        self.assertEqual(normalized["job_id"], "job-123")
        self.assertEqual(normalized["status"], "exporting")
        self.assertIn("uploading", normalized["message"])

    def test_count_rows_supports_csv_and_json_exports(self):
        csv_path = self.TEST_DIR / "_tmp_worker_job_leads.csv"
        json_path = self.TEST_DIR / "_tmp_worker_job_leads.json"
        csv_path.write_text("email\none@example.com\ntwo@example.com\n", encoding="utf-8")
        json_path.write_text(json.dumps([{"email": "one@example.com"}]), encoding="utf-8")

        self.assertEqual(worker_api._count_rows(csv_path), 2)
        self.assertEqual(worker_api._count_rows(json_path), 1)

    def test_count_rows_supports_xlsx_exports(self):
        try:
            from openpyxl import Workbook
        except ModuleNotFoundError:
            self.skipTest("openpyxl is not installed in this environment")

        xlsx_path = self.TEST_DIR / "_tmp_worker_job_leads.xlsx"
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["email"])
        worksheet.append(["one@example.com"])
        worksheet.append(["two@example.com"])
        workbook.save(xlsx_path)

        self.assertEqual(worker_api._count_rows(xlsx_path), 2)

    def test_lead_export_files_returns_job_leads_and_audit_files(self):
        expected_leads = self.TEST_DIR / "_tmp_worker_job_leads.csv"
        expected_audit = self.TEST_DIR / "_tmp_worker_job_audit.csv"
        expected_leads.write_text("email\none@example.com\n", encoding="utf-8")
        expected_audit.write_text("email\n", encoding="utf-8")
        (self.TEST_DIR / "_tmp_worker_other_leads.csv").write_text("email\n", encoding="utf-8")

        files = worker_api._lead_export_files({"delivery": {"output_dir": str(self.TEST_DIR)}}, "_tmp_worker_job")

        self.assertEqual(files, [expected_audit, expected_leads])

    def test_lead_export_files_resolves_relative_output_dir_from_project_root(self):
        relative_dir = PROJECT_ROOT / "_tmp_worker_relative"
        relative_dir.mkdir(exist_ok=True)
        expected = relative_dir / "job-123_leads.csv"
        expected.write_text("email\none@example.com\n", encoding="utf-8")

        files = worker_api._lead_export_files({"delivery": {"output_dir": "_tmp_worker_relative"}}, "job-123")

        self.assertEqual(files, [expected])

    def test_prepare_job_config_sets_job_id_and_default_output_dir(self):
        run_dir = PROJECT_ROOT / "_tmp_worker_relative"
        prepared = worker_api._prepare_job_config({"delivery": {"format": "all"}}, "job-123", run_dir)

        self.assertEqual(prepared["job_id"], "job-123")
        self.assertEqual(prepared["delivery"]["output_dir"], str(run_dir / "exports"))
        self.assertTrue((run_dir / "exports").exists())

    def test_deliver_exports_falls_back_to_supabase_register_when_callback_fails(self):
        leads_file = self.TEST_DIR / "_tmp_worker_job_leads.csv"
        leads_file.write_text("email\none@example.com\n", encoding="utf-8")

        captured = {}
        original_post_callback = worker_api._post_callback
        original_register_exports = worker_api._register_exports
        original_upload_to_supabase = worker_api._upload_to_supabase
        try:
            async def fake_post_callback(_url, _payload):
                raise RuntimeError("callback unavailable")

            async def fake_register_exports(job_id, exports):
                captured["job_id"] = job_id
                captured["exports"] = exports

            async def fake_upload_to_supabase(_file_path, _storage_path):
                return None

            worker_api._post_callback = fake_post_callback
            worker_api._register_exports = fake_register_exports
            worker_api._upload_to_supabase = fake_upload_to_supabase

            asyncio.run(
                worker_api._deliver_exports(
                    "_tmp_worker_job",
                    {"delivery": {"output_dir": str(self.TEST_DIR)}},
                    {"export_callback": "https://example.invalid/exports"},
                )
            )
        finally:
            worker_api._post_callback = original_post_callback
            worker_api._register_exports = original_register_exports
            worker_api._upload_to_supabase = original_upload_to_supabase

        self.assertEqual(captured.get("job_id"), "_tmp_worker_job")
        self.assertEqual(len(captured.get("exports", [])), 1)


if __name__ == "__main__":
    unittest.main()
