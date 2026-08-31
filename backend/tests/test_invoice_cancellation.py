"""Tests for issue #26: replacing hard-delete of an issued invoice with a
formal cancellation (Stornorechnung) per §14c UStG.

Deleting or silently editing an issued invoice is not legal — it must be
reversed with a negating counter-document that gets its own sequential
number. These tests map to issue #26's TDD sequence:

1. test_cannot_cancel_a_draft
2. test_cancel_creates_negated_invoice_with_own_number
4. test_original_stays_retrievable_after_cancel
5. test_cancelled_excluded_from_revenue -- see frontend/src/utils.test.ts's
   "computeInvoiceStats" describe block instead: revenue/threshold
   aggregation is purely client-side in this app (Dashboard.tsx), there is
   no backend aggregation endpoint to test here.
6. test_cancel_and_correct_prefills_draft
8. test_cancel_requires_reason
9. test_locale_files_never_say_gutschrift
10. test_cannot_cancel_already_cancelled_invoice

Never use "Gutschrift"/"credit note" anywhere in this feature -- that's a
different legal instrument under §14c UStG and would be a compliance bug,
not a wording nitpick.
"""

import datetime as dt
import json
from decimal import Decimal
from pathlib import Path

from app import models

LOCALES_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "i18n" / "locales"


def _create_payload(**overrides):
    payload = {
        "date": "2026-01-15",
        "client_name": "Test Client",
        "client_address": "Teststr. 1\n12345 Teststadt",
        "service_date": "2026-01-15",
        "items": [{"description": "Shoot", "qty": "1", "price": "100.00", "vat_rate": "19"}],
    }
    payload.update(overrides)
    return payload


def _make_settings(client, kleinunternehmer=False, **overrides):
    payload = {
        "business_name": "Test Studio",
        "address": "Teststr. 1\n12345 Teststadt",
        "tax_number": "DE123456789",
        "kleinunternehmer": kleinunternehmer,
    }
    payload.update(overrides)
    resp = client.put("/api/settings", json=payload)
    assert resp.status_code == 200
    return resp.json()


def _issued_invoice(client, **overrides):
    _make_settings(client)
    created = client.post("/api/invoices", json=_create_payload(**overrides)).json()
    return client.post(f"/api/invoices/{created['id']}/issue").json()


def test_cannot_cancel_a_draft(client):
    _make_settings(client)
    draft = client.post("/api/invoices", json=_create_payload()).json()

    resp = client.post(f"/api/invoices/{draft['id']}/cancel", json={"reason": "Falscher Betrag"})

    assert resp.status_code == 409
    refetched = client.get(f"/api/invoices/{draft['id']}").json()
    assert refetched["status"] == "draft"


def test_cancel_creates_negated_invoice_with_own_number(client):
    issued = _issued_invoice(client)

    resp = client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": "Falscher Betrag berechnet"})

    assert resp.status_code == 201
    cancellation = resp.json()
    assert cancellation["cancels_invoice_id"] == issued["id"]
    assert cancellation["status"] == "offen"
    assert cancellation["number"] is not None
    assert cancellation["number"] != issued["number"]

    assert len(cancellation["items"]) == len(issued["items"])
    for orig_item, cancel_item in zip(issued["items"], cancellation["items"], strict=True):
        assert Decimal(cancel_item["qty"]) == -Decimal(orig_item["qty"])
        # vat_rate is a per-line property independent of sign (issue #33) --
        # it must survive the negation unchanged.
        assert Decimal(cancel_item["vat_rate"]) == Decimal(orig_item["vat_rate"])

    orig_net = sum(Decimal(i["qty"]) * Decimal(i["price"]) for i in issued["items"])
    cancel_net = sum(Decimal(i["qty"]) * Decimal(i["price"]) for i in cancellation["items"])
    assert cancel_net == -orig_net


def test_original_stays_retrievable_after_cancel(client):
    issued = _issued_invoice(client)
    client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": "Falscher Betrag berechnet"})

    resp = client.get(f"/api/invoices/{issued['id']}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "storniert"
    assert body["cancelled_at"] == dt.date.today().isoformat()
    assert body["cancel_reason"] == "Falscher Betrag berechnet"
    # The original's own items are untouched -- not negated in place.
    for orig_item, item in zip(issued["items"], body["items"], strict=True):
        assert Decimal(item["qty"]) == Decimal(orig_item["qty"])
        assert Decimal(item["price"]) == Decimal(orig_item["price"])
    # And the reverse link resolves back to the cancellation invoice.
    assert body["cancellation_invoice_id"] is not None


def test_cancel_and_correct_prefills_draft(client):
    issued = _issued_invoice(client)

    resp = client.post(f"/api/invoices/{issued['id']}/cancel-and-correct", json={"reason": "Kunde falsch"})

    assert resp.status_code == 201
    body = resp.json()
    cancellation = body["cancellation"]
    draft = body["draft"]

    assert cancellation["cancels_invoice_id"] == issued["id"]
    assert cancellation["status"] == "offen"

    assert draft["status"] == "draft"
    assert draft["number"] is None
    assert draft["client_name"] == issued["client_name"]
    assert draft["service_date"] == issued["service_date"]
    assert len(draft["items"]) == len(issued["items"])
    for orig_item, draft_item in zip(issued["items"], draft["items"], strict=True):
        assert draft_item["description"] == orig_item["description"]
        assert Decimal(draft_item["qty"]) == Decimal(orig_item["qty"])
        assert Decimal(draft_item["price"]) == Decimal(orig_item["price"])

    # The original itself is cancelled, same as a plain /cancel call.
    refetched = client.get(f"/api/invoices/{issued['id']}").json()
    assert refetched["status"] == "storniert"


def test_cancel_requires_reason(client):
    issued = _issued_invoice(client)

    resp = client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": ""})
    assert resp.status_code == 422

    resp_ws = client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": "   "})
    assert resp_ws.status_code == 422

    refetched = client.get(f"/api/invoices/{issued['id']}").json()
    assert refetched["status"] == "offen"


def test_cannot_cancel_already_cancelled_invoice(client):
    issued = _issued_invoice(client)
    client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": "Erster Storno"})

    resp = client.post(f"/api/invoices/{issued['id']}/cancel", json={"reason": "Zweiter Versuch"})

    assert resp.status_code == 409


def test_existing_cancellation_fields_default_null(db_session):
    """A row created without any cancellation-related data (the common
    case) must default to an uncancelled state."""
    invoice = models.Invoice(
        number="2025-001",
        date=dt.date(2025, 6, 1),
        client_name="Legacy Client",
        is_kleinunternehmer=True,
        status="offen",
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    assert invoice.cancelled_at is None
    assert invoice.cancel_reason is None
    assert invoice.cancels_invoice_id is None


def _find_forbidden_terms(node, forbidden: tuple[str, ...], path: str = "$") -> list[tuple[str, str]]:
    """Recursively scan a JSON-decoded value for any of `forbidden` as a
    case-insensitive substring, returning `(json_path, term)` for every hit.
    """
    offending: list[tuple[str, str]] = []
    if isinstance(node, dict):
        for key, value in node.items():
            offending.extend(_find_forbidden_terms(value, forbidden, f"{path}.{key}"))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            offending.extend(_find_forbidden_terms(value, forbidden, f"{path}[{i}]"))
    elif isinstance(node, str):
        lowered = node.lower()
        offending.extend((path, term) for term in forbidden if term in lowered)
    return offending


def test_locale_files_never_say_gutschrift():
    """Permanent guard for the terminology requirement (issue #26): a
    Stornorechnung (cancellation invoice) is a distinct legal instrument
    from a "Gutschrift"/"credit note" under §14c UStG, and using the wrong
    term anywhere in the UI would be a compliance bug, not a wording
    nitpick.
    """
    forbidden = ("gutschrift", "credit note")

    for filename in ("de.json", "en.json"):
        data = json.loads((LOCALES_DIR / filename).read_text())
        offending = _find_forbidden_terms(data, forbidden, filename)
        assert not offending, f"{filename} contains forbidden terminology: {offending}"
