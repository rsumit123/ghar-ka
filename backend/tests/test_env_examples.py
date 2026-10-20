"""Every setting must be documented: backend/.env.example lists all Settings fields, frontend examples list all VITE_* vars used."""
import re
from pathlib import Path

from app.config import Settings

ROOT = Path(__file__).resolve().parents[2]


def _keys(path: Path) -> set[str]:
    return set(re.findall(r"^\s*#?\s*([A-Z][A-Z0-9_]+)=", path.read_text(), flags=re.M))


def test_backend_env_example_lists_every_setting():
    documented = _keys(ROOT / "backend" / ".env.example")
    missing = sorted(set(Settings.model_fields) - documented)
    assert not missing, f"Add to backend/.env.example: {missing}"
    unknown = sorted(documented - set(Settings.model_fields))
    assert not unknown, f"Not a Settings field (stale?): {unknown}"


def test_frontend_env_examples_list_every_vite_var():
    used: set[str] = set()
    for base in ("apps", "packages"):
        for f in (ROOT / base).rglob("*"):
            if f.suffix in {".ts", ".tsx", ".html", ".cjs"} and "node_modules" not in f.parts and "dist" not in f.parts:
                used |= set(re.findall(r"\bVITE_[A-Z0-9_]+\b", f.read_text()))
    assert used, "expected to find VITE_* usages"
    for app in ("customer", "vendor"):
        documented = _keys(ROOT / "apps" / app / ".env.example")
        assert used <= documented, f"apps/{app}/.env.example is missing {sorted(used - documented)}"
