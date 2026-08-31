"""Tests for the draft -> issue invoice lifecycle (issue #25) and the
§14 UStG mandatory-field additions on top of it (issue #33).

Each test below maps to one of issue #25's acceptance-criteria checkboxes:

1. test_create_invoice_starts_as_draft_with_no_number
2. test_draft_can_be_edited_via_patch
3. test_patch_on_issued_invoice_returns_409
4. test_issue_assigns_number_and_locks
5. test_delete_draft_succeeds / test_delete_issued_invoice_returns_409
6. test_settings_changed_after_issue_dont_affect_invoice
   test_abandoned_draft_leaves_no_gap
   test_existing_invoices_migrate_untouched

Issue #33 (§14 UStG mandatory fields — Leistungsdatum, per-line VAT rate,
USt-IdNr, Kleinbetragsrechnung) adds:

7. test_issue_fails_without_service_date
8. test_mixed_vat_rate_invoice_totals
9. test_kleinbetragsrechnung_relaxes_address_requirement_under_threshold
   test_kleinbetragsrechnung_requires_address_at_or_above_threshold
10. test_settings_returns_ust_id_nr_when_set
    test_settings_ust_id_nr_defaults_empty
"""

import datetime as dt
from decimal import Decimal

from app import models


def _create_payload(**overrides):
    payload = {
        "date": "2026-01-15",
        "client_name": "Test Client",
        # Every existing test that issues an invoice needs a valid
        # Leistungsdatum/-zeitraum by construction now that it's a §14
        # mandatory field (see issue #33) — tests exercising its absence
        # explicitly pop it back out.
        "service_date": "2026-01-15",
        "items": [{"description": "Shoot", "qty": "1", "price": "100.00"}],
    }
    payload.update(overrides)
    return payload


def _make_settings(client, kleinunternehmer=True, **overrides):
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


def test_create_invoice_starts_as_draft_with_no_number(client):
    _make_settings(client)
    resp = client.post("/api/invoices", json=_create_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["number"] is None
    assert body["issued_at"] is None


def test_draft_can_be_edited_via_patch(client):
    _make_settings(client)
    created = client.post("/api/invoices", json=_create_payload()).json()

    resp = client.patch(f"/api/invoices/{created['id']}", json={"client_name": "Updated Client"})
    assert resp.status_code == 200
    assert resp.json()["client_name"] == "Updated Client"

    refetched = client.get(f"/api/invoices/{created['id']}").json()
    assert refetched["client_name"] == "Updated Client"


def test_patch_on_issued_invoice_returns_409(client):
    _make_settings(client)
    created = client.post("/api/invoices", json=_create_payload()).json()
    client.post(f"/api/invoices/{created['id']}/issue")

    resp = client.patch(f"/api/invoices/{created['id']}", json={"client_name": "Nope"})
    assert resp.status_code == 409


def test_issue_assigns_number_and_locks(client):
    _make_settings(client)
    created = client.post("/api/invoices", json=_create_payload()).json()
    assert created["number"] is None

    resp = client.post(f"/api/invoices/{created['id']}/issue")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "offen"
    assert body["number"] is not None
    assert body["number"].endswith("-001")
    assert body["issued_at"] == dt.date.today().isoformat()


def test_delete_draft_succeeds(client):
    _make_settings(client)
    created = client.post("/api/invoices", json=_create_payload()).json()

    resp = client.delete(f"/api/invoices/{created['id']}")
    assert resp.status_code == 204
    assert client.get(f"/api/invoices/{created['id']}").status_code == 404


def test_delete_issued_invoice_returns_409(client):
    _make_settings(client)
    created = client.post("/api/invoices", json=_create_payload()).json()
    client.post(f"/api/invoices/{created['id']}/issue")

    resp = client.delete(f"/api/invoices/{created['id']}")
    assert resp.status_code == 409
    assert client.get(f"/api/invoices/{created['id']}").status_code == 200


def test_settings_changed_after_issue_dont_affect_invoice(client):
    _make_settings(client, kleinunternehmer=True)
    payload = _create_payload(items=[{"description": "Shoot", "qty": "1", "price": "100.00", "vat_rate": "19"}])
    created = client.post("/api/invoices", json=payload).json()
    issued = client.post(f"/api/invoices/{created['id']}/issue").json()

    assert issued["is_kleinunternehmer"] is True
    # Kleinunternehmer at issue time zeroes every line's vat_rate, the same
    # way the pre-#33 code zeroed the single invoice-level vat_rate.
    assert all(item["vat_rate"] == "0.00" for item in issued["items"])

    _make_settings(client, kleinunternehmer=False)

    refetched = client.get(f"/api/invoices/{issued['id']}").json()
    assert refetched["is_kleinunternehmer"] is True
    assert all(item["vat_rate"] == "0.00" for item in refetched["items"])


def test_abandoned_draft_leaves_no_gap(client):
    _make_settings(client)

    for _ in range(3):
        draft = client.post("/api/invoices", json=_create_payload()).json()
        client.delete(f"/api/invoices/{draft['id']}")

    survivor = client.post("/api/invoices", json=_create_payload()).json()
    issued = client.post(f"/api/invoices/{survivor['id']}/issue").json()

    assert issued["number"].endswith("-001")


def test_existing_invoices_migrate_untouched(db_session):
    """Simulates a pre-existing row seeded the old way (number + status set,
    is_kleinunternehmer set, no issued_at, no service_date/period) surviving
    the schema change with its values untouched.
    """
    old_invoice = models.Invoice(
        number="2025-001",
        date=dt.date(2025, 6, 1),
        client_name="Legacy Client",
        is_kleinunternehmer=True,
        status="offen",
    )
    db_session.add(old_invoice)
    db_session.commit()
    db_session.refresh(old_invoice)

    assert old_invoice.number == "2025-001"
    assert old_invoice.status == "offen"
    assert old_invoice.is_kleinunternehmer is True
    assert old_invoice.issued_at is None
    assert old_invoice.service_date is None
    assert old_invoice.service_period_text is None


def test_issue_fails_without_service_date(client):
    """Issue #33, TDD step 1: a draft with neither a Leistungsdatum nor a
    Leistungszeitraum must not be issuable — §14 Abs. 4 UStG requires one of
    them on every invoice.
    """
    _make_settings(client)
    payload = _create_payload()
    del payload["service_date"]
    created = client.post("/api/invoices", json=payload).json()
    assert created["service_date"] is None
    assert created["service_period_text"] is None

    resp = client.post(f"/api/invoices/{created['id']}/issue")

    assert resp.status_code == 422
    body = resp.json()
    assert "missing_fields" in body["detail"]
    assert any("Leistungsdatum" in m and "Leistungszeitraum" in m for m in body["detail"]["missing_fields"])


def test_issue_succeeds_with_service_period_text_only(client):
    """A free-text period ("August 2026") satisfies the requirement just as
    well as an exact service_date — the wedding-shot-in-August case from the
    issue description.
    """
    _make_settings(client)
    payload = _create_payload()
    del payload["service_date"]
    payload["service_period_text"] = "August 2026"
    created = client.post("/api/invoices", json=payload).json()

    resp = client.post(f"/api/invoices/{created['id']}/issue")

    assert resp.status_code == 200
    assert resp.json()["service_period_text"] == "August 2026"


def test_mixed_vat_rate_invoice_totals(client):
    """Issue #33, TDD step 3: one item at 19%, one at 7% — each line keeps
    its own vat_rate, and the amounts per rate must add up correctly.
    """
    _make_settings(client, kleinunternehmer=False)
    payload = _create_payload(
        client_address="Teststr. 2\n12345 Teststadt",
        items=[
            {"description": "Shooting (Auftragsarbeit)", "qty": "1", "price": "100.00", "vat_rate": "19"},
            {"description": "Bildlizenz", "qty": "1", "price": "50.00", "vat_rate": "7"},
        ],
    )
    created = client.post("/api/invoices", json=payload).json()
    issued = client.post(f"/api/invoices/{created['id']}/issue").json()
    assert issued["status"] == "offen"

    by_rate: dict[str, Decimal] = {}
    for item in issued["items"]:
        net = Decimal(item["qty"]) * Decimal(item["price"])
        by_rate[item["vat_rate"]] = by_rate.get(item["vat_rate"], Decimal("0")) + net

    assert by_rate[Decimal("19.00")] == Decimal("100.00")
    assert by_rate[Decimal("7.00")] == Decimal("50.00")

    gross = sum(
        Decimal(item["qty"]) * Decimal(item["price"]) * (Decimal("1") + Decimal(item["vat_rate"]) / Decimal("100"))
        for item in issued["items"]
    )
    assert gross == Decimal("100.00") * Decimal("1.19") + Decimal("50.00") * Decimal("1.07")


def test_kleinbetragsrechnung_relaxes_address_requirement_under_threshold(client):
    """Issue #33, TDD step 6: under 250€ gross (§33 UStDV), a missing
    client_address must not block issuing.
    """
    _make_settings(client, kleinunternehmer=True)
    payload = _create_payload(client_address="", items=[{"description": "Shoot", "qty": "1", "price": "100.00"}])
    created = client.post("/api/invoices", json=payload).json()
    assert created["client_address"] == ""

    resp = client.post(f"/api/invoices/{created['id']}/issue")

    assert resp.status_code == 200


def test_kleinbetragsrechnung_requires_address_at_or_above_threshold(client):
    """At/above 250€ gross, the normal §14 rule applies: client_address is
    mandatory again.
    """
    _make_settings(client, kleinunternehmer=True)
    payload = _create_payload(client_address="", items=[{"description": "Shoot", "qty": "1", "price": "250.00"}])
    created = client.post("/api/invoices", json=payload).json()

    resp = client.post(f"/api/invoices/{created['id']}/issue")

    assert resp.status_code == 422
    assert any("Anschrift" in m for m in resp.json()["detail"]["missing_fields"])


def test_settings_returns_ust_id_nr_when_set(client):
    resp = client.put("/api/settings", json={"business_name": "Test Studio", "ust_id_nr": "DE999999999"})
    assert resp.status_code == 200
    assert resp.json()["ust_id_nr"] == "DE999999999"


def test_settings_ust_id_nr_defaults_empty(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json()["ust_id_nr"] == ""
