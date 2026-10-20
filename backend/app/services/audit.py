from sqlalchemy.orm import Session

from app.models import AuditLog


def write_audit(db: Session, actor_id: int | None, action: str, entity: str, entity_id: int | None,
                details: dict | None = None) -> AuditLog:
    """Add an AuditLog row to the session (caller commits, so it lands in the same transaction as the change)."""
    row = AuditLog(actor_id=actor_id, action=action, entity=entity, entity_id=entity_id, details=details)
    db.add(row)
    return row
