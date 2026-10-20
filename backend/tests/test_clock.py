from datetime import UTC, date, datetime

import pytest

from app.models import Slot
from app.services import clock

D = date(2026, 10, 21)  # IST is UTC+5:30


def ist(h, m=0, d=D):
    return datetime(d.year, d.month, d.day, h, m, tzinfo=clock.tz()).astimezone(UTC)


def test_slot_start_uses_settings_in_local_time():
    assert clock.slot_start(D, Slot.lunch) == ist(12)
    assert clock.slot_start(D, Slot.dinner) == ist(19, 30)


@pytest.mark.parametrize("preset,slot,expected", [
    ("2h", Slot.lunch, ist(10)),
    ("1h", Slot.dinner, ist(18, 30)),
    ("3h", Slot.dinner, ist(16, 30)),
    ("night_before_9pm", Slot.lunch, ist(21, d=date(2026, 10, 20))),
    ("morning_10am", Slot.dinner, ist(10)),
])
def test_presets(preset, slot, expected):
    assert clock.cutoff_for(D, slot, preset) == expected


def test_default_preset_is_two_hours_and_custom_time_wins():
    assert clock.cutoff_for(D, Slot.lunch) == ist(10)
    assert clock.cutoff_for(D, Slot.lunch, "2h", "09:15") == ist(9, 15)


def test_cutoff_must_precede_slot_and_inputs_validated():
    with pytest.raises(ValueError):
        clock.cutoff_for(D, Slot.lunch, cutoff_time="12:00")
    with pytest.raises(ValueError):
        clock.cutoff_for(D, Slot.lunch, cutoff_time="nope")
    with pytest.raises(ValueError):
        clock.cutoff_for(D, Slot.lunch, "bogus")


def test_now_is_patchable_and_local_today_follows_it(clk):
    assert clock.now() == clk.current
    assert clock.local_today() == date(2026, 10, 20)
    clk.set(datetime(2026, 10, 20, 19, 0, tzinfo=UTC))  # 00:30 IST next day
    assert clock.local_today() == date(2026, 10, 21)
