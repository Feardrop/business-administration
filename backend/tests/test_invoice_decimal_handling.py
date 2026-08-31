"""Coverage that money stays `Decimal` end-to-end, never `float` (issue #17).

AGENTS.md: "Money is always Decimal, never float." This is a backfill
against existing, unmodified behavior in `models.py`/`schemas.py` (both
already use `Numeric`/`Decimal`), but nothing currently asserts it directly
— these tests would fail if a monetary field were ever changed to `Float`/
`float` (in the DB column or the Pydantic schema), including the subtle
case where a value round-trips through SQLite and comes back as a binary
float with rounding error.
"""

from decimal import Decimal

from app import crud, schemas


def _create_invoice(db_session):
    crud.update_settings(db_session, schemas.SettingsSchema(kleinunternehmer=False))
    return crud.create_invoice(
        db_session,
        schemas.InvoiceCreate(
            date="2026-04-01",
            client_name="Decimal Client",
            vat_rate=Decimal("19"),
            items=[
                schemas.InvoiceItemIn(description="Shoot A", qty=Decimal("2"), price=Decimal("99.99")),
                schemas.InvoiceItemIn(description="Shoot B", qty=Decimal("1.5"), price=Decimal("40.01")),
            ],
        ),
    )


def test_item_qty_and_price_are_decimal_on_the_freshly_created_object(db_session):
    invoice = _create_invoice(db_session)
    for item in invoice.items:
        assert isinstance(item.qty, Decimal), f"qty was {type(item.qty)}"
        assert isinstance(item.price, Decimal), f"price was {type(item.price)}"

    assert invoice.items[0].price == Decimal("99.99")
    assert invoice.items[1].price == Decimal("40.01")


def test_vat_rate_is_decimal(db_session):
    invoice = _create_invoice(db_session)
    assert isinstance(invoice.vat_rate, Decimal)
    assert invoice.vat_rate == Decimal("19")


def test_decimal_survives_a_fresh_round_trip_from_the_database(db_session):
    """Re-fetching in a brand-new query (not the in-memory object just
    created) proves the *stored* representation is exact, not just the
    Python object still held in memory before it was ever flushed.

    Would fail if the underlying column type were ever `Float` — SQLite
    would then hand back an imprecise `float` such as
    `19.990000000000002` instead of an exact `Decimal("19.99")`.
    """
    created = _create_invoice(db_session)
    invoice_id = created.id
    db_session.expire_all()

    reloaded = crud.get_invoice(db_session, invoice_id)
    assert isinstance(reloaded.items[0].price, Decimal)
    assert reloaded.items[0].price == Decimal("99.99")
    assert isinstance(reloaded.items[1].qty, Decimal)
    assert reloaded.items[1].qty == Decimal("1.5")


def test_line_and_grand_totals_computed_from_the_items_stay_decimal(db_session):
    """The backend itself doesn't compute totals (the frontend does via
    `invoiceTotals()` in `utils.ts`), but any aggregation done against the
    persisted `Decimal` fields must stay exact rather than silently
    upcasting to `float` through careless arithmetic.
    """
    invoice = _create_invoice(db_session)

    net_total = sum((item.qty * item.price for item in invoice.items), Decimal("0"))
    assert isinstance(net_total, Decimal)
    assert net_total == Decimal("2") * Decimal("99.99") + Decimal("1.5") * Decimal("40.01")

    vat = net_total * invoice.vat_rate / Decimal("100")
    assert isinstance(vat, Decimal)


def test_api_response_serializes_price_as_an_exact_decimal_string(client):
    """Route-level check: the JSON the API actually sends over the wire
    represents money exactly, not as a binary-float-rounded number.

    Pydantic serializes `Decimal` fields as strings by default (see
    `types.ts`'s comment on this), so `price` must come back as the exact
    string "99.99" — not the float literal `99.99` (which JSON encoders are
    free to reformat) and never something like "99.990000000000002".
    """
    resp = client.post(
        "/api/invoices",
        json={
            "date": "2026-04-01",
            "client_name": "Decimal Client",
            "vat_rate": "19",
            "items": [{"description": "Shoot", "qty": "2", "price": "99.99"}],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    price_field = body["items"][0]["price"]
    assert isinstance(price_field, str)
    assert price_field == "99.99"
