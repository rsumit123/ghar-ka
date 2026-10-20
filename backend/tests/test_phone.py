import pytest

from app.services.phone import InvalidPhone, normalize_phone


@pytest.mark.parametrize("raw,expected", [
    ("9876543210", "+919876543210"),
    ("98765 43210", "+919876543210"),
    ("09876543210", "+919876543210"),
    ("919876543210", "+919876543210"),
    ("+91-98765-43210", "+919876543210"),
    ("+14155550123", "+14155550123"),
])
def test_normalize(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "123", "abcdefghij", "5876543210", "+0123456789"])
def test_invalid(raw):
    with pytest.raises(InvalidPhone):
        normalize_phone(raw)
