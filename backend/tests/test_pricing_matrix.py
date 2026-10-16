import pytest

import pricing_matrix as pm
from pricing_matrix import BrandTier, Fuel, Location


def test_all_27_eu_countries_have_base_prices():
    eu = [c for c in pm.COUNTRIES.values() if c.eu]
    assert len(eu) == 27
    for code in (c.code for c in eu):
        # E10 has no Oil Bulletin series of its own; it is priced on the petrol base.
        assert set(pm.BASE_PRICES[code]) == {f.price_basis for f in Fuel}
        assert pm.base_price(code, Fuel.E10) == pm.base_price(code, Fuel.PETROL)


def test_seven_official_countries():
    official = {c.code for c in pm.COUNTRIES.values() if c.official_api}
    assert official == {"DE", "AT", "ES", "FR", "IT", "PT", "SI"}


def test_estimate_formula():
    e = pm.estimate_price("HU", Fuel.DIESEL, BrandTier.PREMIUM, Location.HIGHWAY)
    expected = pm.base_price("HU", Fuel.DIESEL) * pm.BRAND_MULTIPLIERS[BrandTier.PREMIUM] * 1.05
    assert e.price == pytest.approx(round(expected, 3))
    assert e.price_low < e.price < e.price_high


def test_matrix_ordering():
    matrix = pm.estimate_matrix("PL", Fuel.PETROL)
    assert len(matrix) == 9
    by_key = {(e.brand_tier, e.location): e.price for e in matrix}
    assert by_key[(BrandTier.DISCOUNT, Location.SUBURB)] == min(by_key.values())
    assert by_key[(BrandTier.PREMIUM, Location.HIGHWAY)] == max(by_key.values())


@pytest.mark.parametrize(
    "name,tier",
    [
        ("Shell", BrandTier.PREMIUM),
        ("OMV Budapest Váci út", BrandTier.PREMIUM),
        ("MOL", BrandTier.MAINSTREAM),
        ("ORLEN easy", BrandTier.DISCOUNT),
        ("Orlen", BrandTier.MAINSTREAM),
        ("INTERMARCHÉ", BrandTier.DISCOUNT),
        ("JET", BrandTier.DISCOUNT),
        ("Unknown Tankstelle", BrandTier.MAINSTREAM),
        (None, BrandTier.MAINSTREAM),
    ],
)
def test_classify_brand(name, tier):
    assert pm.classify_brand(name) is tier


def test_guess_location():
    assert pm.guess_location("Shell Raststätte Irschenberg") is Location.HIGHWAY
    assert pm.guess_location("Area di servizio Secchia Ovest") is Location.HIGHWAY
    assert pm.guess_location("MOL", "Váci út 1") is None


def test_non_eu_countries_have_base_prices():
    for code in ("CH", "LI", "MC"):
        for fuel in Fuel:
            assert 1.0 < pm.base_price(code, fuel) < 3.5


def test_swiss_price_follows_neighbours():
    """A 0.10 EUR rise next door lifts the Swiss price by ~90% of that, in CHF terms."""
    saved = {c: dict(pm.BASE_PRICES[c]) for c in pm.SWISS_REFERENCE_COUNTRIES}
    before = pm.base_price("CH", Fuel.DIESEL)
    try:
        for c in pm.SWISS_REFERENCE_COUNTRIES:
            pm.BASE_PRICES[c][Fuel.DIESEL] += 0.10
        after = pm.base_price("CH", Fuel.DIESEL)
        assert after - before == pytest.approx(0.10 * pm.SWISS_PASS_THROUGH, abs=0.002)
        assert pm.base_price("LI", Fuel.DIESEL) == after
    finally:
        for c, v in saved.items():
            pm.BASE_PRICES[c] = v


def test_swiss_price_anchor():
    # Anchor-week inputs reproduce the TCS anchor (CHF) exactly.
    from fx import fx

    chf = pm.base_price("CH", Fuel.PETROL) * fx.rate("CHF")
    assert chf == pytest.approx(2.028, abs=0.003)
