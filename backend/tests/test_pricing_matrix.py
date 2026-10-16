import pytest

import pricing_matrix as pm
from pricing_matrix import BrandTier, Fuel, Location


def test_all_27_eu_countries_have_base_prices():
    assert len(pm.COUNTRIES) == 27
    for code in pm.COUNTRIES:
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
