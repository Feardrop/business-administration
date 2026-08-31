#!/usr/bin/env python3
"""Extract one version's section from CHANGELOG.md for use as GitHub Release notes.

Usage: extract_changelog_section.py VERSION [CHANGELOG_PATH]

Looks for a heading line of the form `## [VERSION] - ...` (the `- date`
suffix is optional and ignored) and prints everything up to, but not
including, the next `## [` heading. Exits non-zero with a clear message if
the version has no section — this is meant to fail the release workflow
loudly rather than publish an empty-or-wrong release body.
"""

import re
import sys


def extract(changelog_text: str, version: str) -> str:
    heading_pattern = re.compile(
        r"^##\s*\[" + re.escape(version) + r"\]" + r"(?:\s*-\s*.*)?\s*$",
        re.MULTILINE,
    )
    match = heading_pattern.search(changelog_text)
    if not match:
        raise SystemExit(
            f"No CHANGELOG.md section found for version '{version}' (expected a '## [{version}]' heading)."
        )

    start = match.end()
    next_heading = re.search(r"^##\s*\[", changelog_text[start:], re.MULTILINE)
    end = start + next_heading.start() if next_heading else len(changelog_text)

    section = changelog_text[start:end].strip("\n")
    if not section:
        raise SystemExit(
            f"CHANGELOG.md section for version '{version}' is empty — add release notes before tagging."
        )
    return section


def main() -> None:
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)

    version = sys.argv[1].lstrip("v")
    changelog_path = sys.argv[2] if len(sys.argv) == 3 else "CHANGELOG.md"

    with open(changelog_path, encoding="utf-8") as f:
        text = f.read()

    print(extract(text, version))


if __name__ == "__main__":
    main()
