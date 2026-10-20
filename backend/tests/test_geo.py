import httpx
import pytest

from app.services import geo


@pytest.fixture(autouse=True)
def fast_throttle(monkeypatch):
    monkeypatch.setattr(geo, "MIN_INTERVAL_S", 0)


class FakeResp:
    def __init__(self, data, status=200):
        self.data, self.status = data, status

    def raise_for_status(self):
        if self.status >= 400:
            raise httpx.HTTPStatusError("bad", request=None, response=None)

    def json(self):
        return self.data


def test_search_cached_second_call_no_http(client, monkeypatch):
    calls = []

    def fake_get(url, params=None, headers=None, timeout=None):
        calls.append((url, params, headers, timeout))
        return FakeResp([{"display_name": "Koramangala, Bengaluru", "lat": "12.93", "lon": "77.62"},
                         {"display_name": "Koramangala 4th Block", "lat": "12.935", "lon": "77.63"}])

    monkeypatch.setattr(httpx, "get", fake_get)
    r = client.get("/api/v1/geo/search", params={"q": "  Koramangala  "})
    assert r.status_code == 200
    assert r.json()[0] == {"display_name": "Koramangala, Bengaluru", "lat": 12.93, "lng": 77.62}
    assert len(r.json()) == 2
    url, params, headers, timeout = calls[0]
    assert url.endswith("/search") and params["limit"] == 5 and params["countrycodes"] == "in"
    assert "gharka" in headers["User-Agent"] and timeout == 5.0

    r2 = client.get("/api/v1/geo/search", params={"q": "koramangala"})  # normalised -> cache hit
    assert r2.json() == r.json()
    assert len(calls) == 1


def test_reverse_cached_by_rounded_coords(client, monkeypatch):
    calls = []

    def fake_get(url, **kw):
        calls.append(url)
        return FakeResp({"display_name": "Some Road"})

    monkeypatch.setattr(httpx, "get", fake_get)
    assert client.get("/api/v1/geo/reverse", params={"lat": 12.934512, "lng": 77.61234}).json()["display_name"] == "Some Road"
    client.get("/api/v1/geo/reverse", params={"lat": 12.934549, "lng": 77.61231})
    assert len(calls) == 1


def test_upstream_failure_is_502(client, monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectTimeout("slow")

    monkeypatch.setattr(httpx, "get", boom)
    r = client.get("/api/v1/geo/search", params={"q": "anywhere"})
    assert r.status_code == 502 and "try again" in r.json()["detail"].lower()
    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResp({}, 500))
    assert client.get("/api/v1/geo/reverse", params={"lat": 1, "lng": 1}).status_code == 502


def test_validation(client):
    assert client.get("/api/v1/geo/search", params={"q": "ab"}).status_code == 422
    assert client.get("/api/v1/geo/reverse", params={"lat": 100, "lng": 0}).status_code == 422


def test_throttle_spaces_calls(monkeypatch):
    slept = []
    monkeypatch.setattr(geo, "MIN_INTERVAL_S", 1.0)
    monkeypatch.setattr(geo.time, "sleep", lambda s: slept.append(s))
    geo._throttle()
    geo._throttle()
    assert slept and 0 < slept[-1] <= 1.0
