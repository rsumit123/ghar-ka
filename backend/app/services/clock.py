"""Time helpers. Every "now" comparison in the app goes through `now()` so tests can freeze or move time.

Tests: `monkeypatch.setattr(clock, "now", lambda: datetime(...UTC))` (callers must use `clock.now()`, never
`from app.services.clock import now`) or use the `freeze_time` fixture.

Cutoff model: each MenuOffering stores an absolute `cutoff_at` (UTC). Presets are only a way to compute it.
"""
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.models.enums import Slot


def now() -> datetime:
    """Current instant, timezone-aware UTC."""
    return datetime.now(UTC)


def tz() -> ZoneInfo:
    return ZoneInfo(get_settings().APP_TIMEZONE)


def local_now() -> datetime:
    return now().astimezone(tz())


def local_today() -> date:
    """Today's date in APP_TIMEZONE."""
    return local_now().date()


def _parse_hhmm(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def slot_start_time(slot: Slot) -> time:
    s = get_settings()
    return _parse_hhmm(s.LUNCH_START if slot == Slot.lunch else s.DINNER_START)


def at_local(d: date, t: time) -> datetime:
    """Local wall-clock date+time -> aware UTC datetime."""
    return datetime.combine(d, t, tzinfo=tz()).astimezone(UTC)


def slot_start(d: date, slot: Slot) -> datetime:
    return at_local(d, slot_start_time(slot))


@dataclass(frozen=True)
class CutoffPreset:
    id: str
    hours_before: float | None = None  # relative to slot start
    day_offset: int = 0  # 0 = same day as the meal, -1 = previous day
    at: time | None = None  # fixed local time of day


PRESETS: dict[str, CutoffPreset] = {
    "1h": CutoffPreset("1h", hours_before=1),
    "2h": CutoffPreset("2h", hours_before=2),
    "3h": CutoffPreset("3h", hours_before=3),
    "night_before_9pm": CutoffPreset("night_before_9pm", day_offset=-1, at=time(21, 0)),
    "morning_10am": CutoffPreset("morning_10am", day_offset=0, at=time(10, 0)),
}
DEFAULT_PRESET = "2h"


def cutoff_for(d: date, slot: Slot, preset: str | None = None, cutoff_time: str | None = None) -> datetime:
    """Compute cutoff_at (aware UTC) for a meal on `d`.

    `cutoff_time` ("HH:MM", local, same day as the meal) wins over `preset`.
    Raises ValueError for an unknown preset / bad time or a cutoff at/after the slot start.
    """
    start = slot_start(d, slot)
    if cutoff_time:
        try:
            result = at_local(d, _parse_hhmm(cutoff_time))
        except (ValueError, TypeError):
            raise ValueError("Cutoff time must look like 09:30") from None
    else:
        p = PRESETS.get(preset or DEFAULT_PRESET)
        if p is None:
            raise ValueError(f"Unknown cutoff preset '{preset}'")
        if p.hours_before is not None:
            result = start - timedelta(hours=p.hours_before)
        else:
            assert p.at is not None
            result = at_local(d + timedelta(days=p.day_offset), p.at)
    if result >= start:
        raise ValueError("Order-by time must be before the meal starts")
    return result
