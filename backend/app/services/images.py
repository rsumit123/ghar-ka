"""Upload handling: validate, normalise images (EXIF orient+strip, <=1600px, JPEG q82), random filenames.

Never trusts the client filename or content-type: the bytes are opened with Pillow (or magic-checked for PDF).
Public files live in UPLOAD_DIR/public (served at /media), private ones in UPLOAD_DIR/private (admin endpoint only).
"""
import io
import secrets
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings

MAX_DIMENSION = 1600
JPEG_QUALITY = 82
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO", "HEIF", "HEIC"}
Image.MAX_IMAGE_PIXELS = 60_000_000  # decompression-bomb guard (raises DecompressionBombError above 2x)

try:  # optional HEIC support if pillow-heif is installed
    from pillow_heif import register_heif_opener  # type: ignore[import-not-found]

    register_heif_opener()
except Exception:  # noqa: BLE001
    pass


class UploadError(ValueError):
    """Raised with a user-friendly message; routers map it to HTTP 400/413."""

    def __init__(self, detail: str, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class StoredFile:
    path: str  # relative to UPLOAD_DIR/(public|private), forward slashes
    is_private: bool
    content_type: str


def upload_root(private: bool) -> Path:
    return Path(get_settings().UPLOAD_DIR) / ("private" if private else "public")


def resolve_path(path: str, private: bool) -> Path | None:
    """Absolute path of a stored file, or None if it would escape the upload root."""
    root = upload_root(private).resolve()
    full = (root / path).resolve()
    return full if full.is_relative_to(root) else None


def read_limited(fileobj, max_mb: int | None = None) -> bytes:
    limit = (max_mb or get_settings().MAX_UPLOAD_MB) * 1024 * 1024
    data = fileobj.read(limit + 1)
    if len(data) > limit:
        raise UploadError(f"File is too large (max {max_mb or get_settings().MAX_UPLOAD_MB} MB)", 413)
    if not data:
        raise UploadError("The file is empty")
    return data


def process_image(data: bytes) -> bytes:
    """Return clean JPEG bytes: orientation applied, EXIF/metadata dropped, longest side <= 1600px."""
    try:
        img = Image.open(io.BytesIO(data))
        if img.format not in ALLOWED_FORMATS:
            raise UploadError("Please upload a JPEG, PNG or WebP photo")
        img.load()
    except UploadError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError, ValueError):
        raise UploadError("That file is not a valid photo") from None

    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.getchannel("A"))
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    # Saving a fresh image without exif= drops all metadata.
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()


def save_upload(fileobj, *, subdir: str, private: bool, allow_pdf: bool = False) -> StoredFile:
    """Validate + store an upload. `subdir` is a server-chosen folder (e.g. 'v12'); filename is random."""
    data = read_limited(fileobj)
    if data[:5] == b"%PDF-":
        if not (allow_pdf and private):
            raise UploadError("PDF files are only accepted for documents")
        name, content, ctype = f"{secrets.token_hex(16)}.pdf", data, "application/pdf"
    else:
        content, name, ctype = process_image(data), f"{secrets.token_hex(16)}.jpg", "image/jpeg"

    rel = f"{subdir}/{name}"
    dest = upload_root(private) / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return StoredFile(path=rel, is_private=private, content_type=ctype)


def delete_stored(path: str, private: bool) -> None:
    full = resolve_path(path, private)
    if full is not None:
        full.unlink(missing_ok=True)
