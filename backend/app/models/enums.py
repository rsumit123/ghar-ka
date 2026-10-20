"""String enums shared by models and schemas. Stored as VARCHAR (portable)."""
from enum import StrEnum


class Role(StrEnum):
    customer = "customer"
    vendor = "vendor"
    admin = "admin"


class ReviewStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    suspended = "suspended"


class MediaKind(StrEnum):
    profile = "profile"
    kitchen = "kitchen"
    id_proof = "id_proof"
    address_proof = "address_proof"
    passport_photo = "passport_photo"
    dish = "dish"

    @property
    def is_private(self) -> bool:
        return self in (MediaKind.id_proof, MediaKind.address_proof, MediaKind.passport_photo)


class FssaiStatus(StrEnum):
    docs_pending = "docs_pending"
    docs_received = "docs_received"
    application_filed = "application_filed"
    registration_issued = "registration_issued"
    rejected = "rejected"


class Slot(StrEnum):
    lunch = "lunch"
    dinner = "dinner"


class Diet(StrEnum):
    veg = "veg"
    nonveg = "nonveg"
    egg = "egg"


class OrderStatus(StrEnum):
    placed = "placed"
    accepted = "accepted"
    ready = "ready"
    completed = "completed"
    cancelled = "cancelled"


class Fulfilment(StrEnum):
    pickup = "pickup"
    delivery = "delivery"


class PaymentMethod(StrEnum):
    cod = "cod"
    razorpay = "razorpay"


class PaymentStatus(StrEnum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class SubscriptionStatus(StrEnum):
    active = "active"
    paused = "paused"
    cancelled = "cancelled"


class ComplaintStatus(StrEnum):
    open = "open"
    resolved = "resolved"
