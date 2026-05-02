import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from aiohttp import web


PROJECT_ROOT = Path(__file__).resolve().parent
RUNS_DIR = PROJECT_ROOT / "exports" / "worker-runs"


def _json_response(payload, status=200):
    return web.json_response(payload, status=status)


def _check_secret(request):
    expected = os.environ.get("WORKER_API_SECRET") or os.environ.get("N8N_WEBHOOK_SECRET")
    if not expected:
        return True
    supplied = request.headers.get("x-exportflow-secret", "")
    return supplied == expected


def _parse_job_config(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


async def health(_request):
    return _json_response({"ok": True, "service": "exportflow-worker"})


async def run_job(request):
    print(f"[worker] /run-job hit at {datetime.now(timezone.utc).isoformat()}", flush=True)
    if not _check_secret(request):
        print("[worker] rejected request: invalid secret", flush=True)
        return _json_response({"error": "Invalid worker secret."}, status=401)

    try:
        payload = await request.json()
    except json.JSONDecodeError:
        print("[worker] rejected request: body was not JSON", flush=True)
        return _json_response({"error": "Request body must be JSON."}, status=400)

    job_config = _parse_job_config(payload.get("job_config")) or _parse_job_config(payload)
    job_id = str(payload.get("job_id") or (job_config or {}).get("job_id") or uuid4()).strip()
    if not job_config:
        print(f"[worker] rejected request: missing job_config | keys={list(payload.keys())}", flush=True)
        return _json_response({"error": "job_id and job_config are required."}, status=400)

    print(f"[worker] accepted job {job_id}", flush=True)
    run_dir = RUNS_DIR / job_id
    run_dir.mkdir(parents=True, exist_ok=True)

    job_config_path = run_dir / "job_config.json"
    status_output_path = run_dir / "events.jsonl"
    stdout_path = run_dir / "stdout.log"
    stderr_path = run_dir / "stderr.log"

    with job_config_path.open("w", encoding="utf-8") as file_handle:
        json.dump(job_config, file_handle, ensure_ascii=True, indent=2)

    command = [
        sys.executable,
        str(PROJECT_ROOT / "final scrapper.py"),
        "--job-config",
        str(job_config_path),
        "--status-output",
        str(status_output_path),
        "--job-id",
        job_id,
    ]

    stdout_handle = stdout_path.open("ab")
    stderr_handle = stderr_path.open("ab")
    process = subprocess.Popen(
        command,
        cwd=str(PROJECT_ROOT),
        stdout=stdout_handle,
        stderr=stderr_handle,
        start_new_session=os.name != "nt",
    )

    started_at = datetime.now(timezone.utc).isoformat()
    return _json_response(
        {
            "ok": True,
            "job_id": job_id,
            "pid": process.pid,
            "started_at": started_at,
            "run_dir": str(run_dir),
            "status_output": str(status_output_path),
            "stdout": str(stdout_path),
            "stderr": str(stderr_path),
        },
        status=202,
    )


def create_app():
    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_post("/run-job", run_job)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("WORKER_PORT", "8787"))
    web.run_app(create_app(), host="0.0.0.0", port=port)
