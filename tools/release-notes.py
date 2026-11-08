"""Extract a version's player-facing notes; fail on missing or empty notes."""
import re
import sys
from pathlib import Path

version = sys.argv[1]
text = Path("CHANGELOG.md").read_text(encoding="utf-8")
match = re.search(r"^## " + re.escape(version) + r"(?:[ \t][^\n]*)?\n(.*?)(?=^## |\Z)", text, re.M | re.S)
if not match or not match.group(1).strip():
    raise SystemExit("Missing or empty CHANGELOG section: " + version)
print(match.group(1).strip())
