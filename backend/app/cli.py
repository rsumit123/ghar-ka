"""Admin CLI: `python -m app.cli create-admin --email a@b.c --password ...`."""
import argparse
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Role, User
from app.services.security import hash_password


def create_admin(email: str, password: str, name: str = "Admin") -> str:
    email = email.strip().lower()
    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user and user.role != Role.admin:
            raise SystemExit(f"{email} already belongs to a non-admin user")
        created = user is None
        if created:
            user = User(role=Role.admin, email=email, name=name)
            db.add(user)
        user.password_hash = hash_password(password)
        db.commit()
    return "created" if created else "password updated"


def materialize(days_ahead: int = 1) -> int:
    from datetime import timedelta

    from app.services import clock
    from app.services.subscriptions import materialize_subscription_orders

    with SessionLocal() as db:
        return materialize_subscription_orders(db, clock.local_today() + timedelta(days=days_ahead))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("create-admin", help="create (or reset password of) an admin user")
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--name", default="Admin")
    m = sub.add_parser("materialize", help="create orders for tiffin subscription meals whose order-by time has passed")
    m.add_argument("--days-ahead", type=int, default=1, help="include meals up to this many days from today (default 1)")
    args = parser.parse_args(argv)
    if args.cmd == "create-admin":
        print(f"Admin {args.email}: {create_admin(args.email, args.password, args.name)}")
    elif args.cmd == "materialize":
        print(f"Created {materialize(args.days_ahead)} subscription order(s)")


if __name__ == "__main__":
    main(sys.argv[1:])
