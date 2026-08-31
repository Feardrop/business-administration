"""Tests for the draft -> issue invoice lifecycle (issue #25).

Each test below maps to one of issue #25's acceptance-criteria checkboxes:

1. test_create_invoice_starts_as_draft_with_no_number
2. test_draft_can_be_edited_via_patch
3. test_patch_on_issued_invoice_returns_409
4. test_issue_assigns_number_and_locks
5. test_delete_draft_succeeds / test_delete_issued_invoice_returns_409
6. test_settings_changed_after_issue_dont_affect_invoice
   test_abandoned_draft_leaves_no_gap
   test_existing_invoices_migrate_untouched
"""

import datetime as dt

from app import models


def _create_payload(**overrides):
    payload = {
        "date": "2026-01-15",
        "client_name": "Test Client",
        "items": [{"description": "Shoot", "qty": "1", "price": "100.00"}],
    }
    payload.update(overrides)
    return payload


def _make_settings(client, kleinunternehmer=True):
    resp = client.put(
        "/api/settings",
        json={
            "business_name": "Test Studio",
            "tax_number": "DE123456789",
            "kleinunternehmer": kleinunternehmer,
        },
    )
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
    created = client.post("/api/invoices", json=_create_payload(vat_rate="19")).json()
    issued = client.post(f"/api/invoices/{created['id']}/issue").json()

    assert issued["is_kleinunternehmer"] is True
    assert issued["vat_rate"] == "0.00"

    _make_settings(client, kleinunternehmer=False)

    refetched = client.get(f"/api/invoices/{issued['id']}").json()
    assert refetched["is_kleinunternehmer"] is True
    assert refetched["vat_rate"] == "0.00"


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
    is_kleinunternehmer set, no issued_at) surviving the schema change with
    its values untouched.
    """
    old_invoice = models.Invoice(
        number="2025-001",
        date=dt.date(2025, 6, 1),
        client_name="Legacy Client",
        is_kleinunternehmer=True,
        vat_rate=0,
        status="offen",
    )
    db_session.add(old_invoice)
    db_session.commit()
    db_session.refresh(old_invoice)

    assert old_invoice.number == "2025-001"
    assert old_invoice.status == "offen"
    assert old_invoice.is_kleinunternehmer is True
    assert old_invoice.issued_at is None
