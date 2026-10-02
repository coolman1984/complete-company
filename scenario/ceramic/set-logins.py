"""The HR half of set-logins.mjs: admin / 123 (and the second people the four-eyes rules need) in a DEMO HR data folder, while its server is stopped.

HR refuses a password shorter than 8 characters on its own screens; like its own demo builder (tools/make_demo.py) this writes the short demo password
straight into the accounts. It refuses a folder without the demo marker (company.json with "demo": true, written by the scenario engine).

    python set-logins.py <demo data folder>

Users after it (all with password 123): admin (administrator), hr.officer (HR officer: enters and calculates, cannot approve) and hr.approver
(administrator: approves what the officer calculated). A pay run is approved by someone other than the person who calculated it.
"""
import json
import os
import sys

folder = os.path.abspath(sys.argv[1])
marker = os.path.join(folder, "company.json")
if not os.path.isfile(marker) or json.load(open(marker, encoding="utf-8")).get("demo") is not True:
    sys.exit(f"{folder} is not a demo data folder (no company.json with demo: true): refusing to touch its accounts")
root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
hr = os.path.join(root, "hr-system")
sys.path.insert(0, hr)
sys.path.insert(0, os.path.join(hr, "vendor.zip"))
os.environ["HR_HOME"] = os.path.join(folder, "hr")

from hr_core.app import Product  # noqa: E402
from hr_core.auth import hash_password  # noqa: E402
from hr_core.home import Home  # noqa: E402

product = Product(Home(os.environ["HR_HOME"]))
svc = product.open(link=False)
try:
    auth = svc.auth
    pw = hash_password("123")
    existing = {c for c in ("admin", "hr.officer", "hr.approver") if auth._get("user", c)}
    if "hr.approver" not in existing:
        # created in the accounts (a strong password first), then given the short demo one below
        svc.auth.commit("admin", "demo: second administrator who approves pay runs", [{"entity": "user", "code": "hr.approver", "fields": {
            "display_name": "HR approver", "pw": hash_password("Demo-2026!approver"), "profile": "administrator", "extra_perms": [], "active": 1, "must_change": 0}}])
    for code in ("admin", "hr.officer", "hr.approver"):
        cur = auth._get("user", code)
        if cur:
            auth.commit("admin", f"demo: {code} signs in with the demo password", [{"entity": "user", "code": code, "fields": {"pw": pw, "must_change": 0, "active": 1}, "expected_ver": cur["ver"]}])
    print("HR: admin, hr.officer and hr.approver sign in with 123")
finally:
    svc.close()
