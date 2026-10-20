"""Import every model so Base.metadata is complete (Alembic autogenerate, create_all)."""
from app.models.audit import AuditLog
from app.models.enums import (
    ComplaintStatus,
    Diet,
    FssaiStatus,
    Fulfilment,
    MediaKind,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    ReviewStatus,
    Role,
    Slot,
    SubscriptionStatus,
)
from app.models.feedback import Complaint, Review
from app.models.locality import GeocodeCache, Locality
from app.models.menu import MenuOffering
from app.models.order import Order, OrderItem
from app.models.subscription import Subscription, SubscriptionSkip, TiffinPlan
from app.models.user import AuthSession, OtpCode, User
from app.models.vendor import FssaiRecord, Vendor, VendorMedia

__all__ = [
    "AuditLog", "AuthSession", "Complaint", "ComplaintStatus", "Diet", "FssaiRecord", "FssaiStatus",
    "Fulfilment", "GeocodeCache", "Locality", "MediaKind", "MenuOffering", "Order", "OrderItem",
    "OrderStatus", "OtpCode", "PaymentMethod", "PaymentStatus", "Review", "ReviewStatus", "Role",
    "Slot", "Subscription", "SubscriptionSkip", "SubscriptionStatus", "TiffinPlan", "User", "Vendor",
    "VendorMedia",
]
