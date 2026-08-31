"""Tests for expense CRUD operations and the expenses API."""

from decimal import Decimal

import pytest

from app import crud, schemas


def test_patch_updates_only_given_fields(db_session):
    """Test that PATCH updates only the provided fields."""
    # Create an expense
    expense = crud.create_expense(
        db_session,
        schemas.ExpenseCreate(
            date="2026-01-15",
            category="equipment",
            description="Memory card",
            amount=Decimal("50.00"),
        ),
    )

    # Update only the amount
    updated = crud.update_expense(
        db_session,
        expense,
        schemas.ExpenseUpdate(amount=Decimal("75.00")),
    )

    assert updated.id == expense.id
    assert updated.amount == Decimal("75.00")
    assert updated.description == "Memory card"
    assert updated.category == "equipment"
    assert updated.date.isoformat() == "2026-01-15"


def test_patch_unknown_id_returns_404(client):
    """Test that PATCH to non-existent expense returns 404."""
    resp = client.patch(
        "/api/expenses/999",
        json={"amount": "100.00"},
    )
    assert resp.status_code == 404


def test_patch_negative_amount_rejected(client, db_session):
    """Test that negative amounts are rejected."""
    expense = crud.create_expense(
        db_session,
        schemas.ExpenseCreate(
            date="2026-01-15",
            category="equipment",
            description="Memory card",
            amount=Decimal("50.00"),
        ),
    )

    resp = client.patch(
        f"/api/expenses/{expense.id}",
        json={"amount": "-10.00"},
    )
    assert resp.status_code == 422  # Validation error


def test_patch_missing_description_rejected(client, db_session):
    """Test that empty descriptions are rejected when provided."""
    expense = crud.create_expense(
        db_session,
        schemas.ExpenseCreate(
            date="2026-01-15",
            category="equipment",
            description="Memory card",
            amount=Decimal("50.00"),
        ),
    )

    resp = client.patch(
        f"/api/expenses/{expense.id}",
        json={"description": ""},
    )
    assert resp.status_code == 422  # Validation error


def test_patch_invalid_category_rejected(client, db_session):
    """Test that invalid categories are rejected."""
    expense = crud.create_expense(
        db_session,
        schemas.ExpenseCreate(
            date="2026-01-15",
            category="equipment",
            description="Memory card",
            amount=Decimal("50.00"),
        ),
    )

    resp = client.patch(
        f"/api/expenses/{expense.id}",
        json={"category": "invalid_category"},
    )
    assert resp.status_code == 422  # Validation error


@pytest.mark.slow
def test_patch_via_http_api(client):
    """End-to-end test: create an expense, then update it via PATCH."""
    # Create
    create_resp = client.post(
        "/api/expenses",
        json={
            "date": "2026-01-15",
            "category": "equipment",
            "description": "Memory card",
            "amount": 50.00,
        },
    )
    assert create_resp.status_code == 201
    expense = create_resp.json()

    # Update amount only
    update_resp = client.patch(
        f"/api/expenses/{expense['id']}",
        json={"amount": 75.00},
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["amount"] == "75.00"
    assert updated["description"] == "Memory card"
    assert updated["category"] == "equipment"

    # Verify via list
    list_resp = client.get("/api/expenses")
    assert list_resp.status_code == 200
    expenses = list_resp.json()
    assert len(expenses) == 1
    assert expenses[0]["amount"] == "75.00"
