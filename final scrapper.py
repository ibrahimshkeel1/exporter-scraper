"""Final buyer lead scraper launcher.

Run this file from the project root:
    python "final scrapper.py" --region USA --industry "apparel importers wholesalers private label clothing buyers" --hunt-first-a-plus --hunt-max-analyzed 25 --audit-output audit.csv
"""

from pathlib import Path
import runpy
import sys


PROJECT_ROOT = Path(__file__).resolve().parent
SCRAPER_DIR = PROJECT_ROOT / "scraper"

if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

runpy.run_path(str(SCRAPER_DIR / "main.py"), run_name="__main__")
