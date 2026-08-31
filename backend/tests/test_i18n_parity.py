"""Guards that `de.json` and `en.json` carry exactly the same set of
translation keys (issue #17).

Nothing currently enforces this — a string added to one locale file and
forgotten in the other would previously go unnoticed until someone happened
to switch languages and hit a missing key. Written in Python (rather than a
Vitest test under `frontend/src/i18n/`) since it's a pure data-shape check
with no need for a DOM or i18next runtime — the two JSON files are read
directly and their key sets compared.
"""

import json
from pathlib import Path

LOCALES_DIR = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n" / "locales"


def _flatten_keys(node: dict, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, value in node.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            keys |= _flatten_keys(value, full_key)
        else:
            keys.add(full_key)
    return keys


def _load_keys(filename: str) -> set[str]:
    data = json.loads((LOCALES_DIR / filename).read_text(encoding="utf-8"))
    return _flatten_keys(data)


def test_locale_files_exist():
    assert (LOCALES_DIR / "de.json").is_file()
    assert (LOCALES_DIR / "en.json").is_file()


def test_de_and_en_have_identical_key_sets():
    de_keys = _load_keys("de.json")
    en_keys = _load_keys("en.json")

    missing_in_en = sorted(de_keys - en_keys)
    missing_in_de = sorted(en_keys - de_keys)

    assert not missing_in_en, f"Keys present in de.json but missing from en.json: {missing_in_en}"
    assert not missing_in_de, f"Keys present in en.json but missing from de.json: {missing_in_de}"


def test_neither_locale_file_is_empty():
    """Sanity check the parity test above isn't vacuously true because both
    files failed to load any keys at all.
    """
    assert len(_load_keys("de.json")) > 50
    assert len(_load_keys("en.json")) > 50
