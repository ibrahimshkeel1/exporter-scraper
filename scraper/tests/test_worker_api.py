import json
import shutil
import sys
import unittest
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
        from openpyxl import Workbook

        xlsx_path = self.TEST_DIR / "_tmp_worker_job_leads.xlsx"
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["email"])
        worksheet.append(["one@example.com"])
        worksheet.append(["two@example.com"])
        workbook.save(xlsx_path)

        self.assertEqual(worker_api._count_rows(xlsx_path), 2)

    def test_lead_export_files_only_returns_job_leads(self):
        expected = self.TEST_DIR / "_tmp_worker_job_leads.csv"
        expected.write_text("email\none@example.com\n", encoding="utf-8")
        (self.TEST_DIR / "_tmp_worker_job_audit.csv").write_text("email\n", encoding="utf-8")
        (self.TEST_DIR / "_tmp_worker_other_leads.csv").write_text("email\n", encoding="utf-8")

        files = worker_api._lead_export_files({"delivery": {"output_dir": str(self.TEST_DIR)}}, "_tmp_worker_job")

        self.assertEqual(files, [expected])

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


if __name__ == "__main__":
    unittest.main()
