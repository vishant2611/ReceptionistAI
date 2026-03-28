from pathlib import Path
import re
import textwrap


ROOT = Path(r"C:\Users\Crop Defender\Receptionist AI")
SOURCE = ROOT / "AI_RECEPTIONIST_BLUEPRINT.md"
PDF_OUT = ROOT / "output" / "pdf" / "Receptionist_AI_Blueprint.pdf"
DOC_OUT = ROOT / "output" / "doc" / "Receptionist_AI_Blueprint.doc"


def parse_markdown(lines: list[str]) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    buffer: list[str] = []

    def flush_paragraph() -> None:
        nonlocal buffer
        if buffer:
            text = " ".join(part.strip() for part in buffer).strip()
            if text:
                blocks.append(("p", text))
            buffer = []

    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            flush_paragraph()
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            blocks.append(("h1", stripped[2:].strip()))
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            blocks.append(("h2", stripped[3:].strip()))
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            blocks.append(("h3", stripped[4:].strip()))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            flush_paragraph()
            blocks.append(("ol", re.sub(r"^\d+\.\s+", "", stripped)))
            continue

        if stripped.startswith("- "):
            flush_paragraph()
            blocks.append(("ul", stripped[2:].strip()))
            continue

        if stripped.startswith("`") and stripped.endswith("`") and len(stripped) > 1:
            flush_paragraph()
            blocks.append(("quote", stripped.strip("`")))
            continue

        buffer.append(stripped)

    flush_paragraph()
    return blocks


def clean_inline(text: str) -> str:
    return re.sub(r"`([^`]+)`", r"\1", text)


def build_rtf_doc(blocks: list[tuple[str, str]]) -> None:
    DOC_OUT.parent.mkdir(parents=True, exist_ok=True)

    parts = [
        r"{\rtf1\ansi\deff0",
        r"{\fonttbl{\f0 Arial;}{\f1 Courier New;}}",
        r"\paperw12240\paperh15840\margl1080\margr1080\margt900\margb900",
        r"\fs40\b\qc Receptionist AI Blueprint\b0\par",
        r"\fs22\i Product, technology, and MVP planning document\i0\par",
        r"\fs22\ql\par",
    ]

    for kind, raw_text in blocks:
        text = clean_inline(raw_text)
        text = (
            text.replace("\\", r"\\")
            .replace("{", r"\{")
            .replace("}", r"\}")
        )

        if kind == "h1":
            parts.append(rf"\fs30\b {text}\b0\fs22\par")
        elif kind == "h2":
            parts.append(rf"\fs26\b {text}\b0\fs22\par")
        elif kind == "h3":
            parts.append(rf"\fs24\b {text}\b0\fs22\par")
        elif kind == "ul":
            parts.append(rf"\li360 \bullet\tab {text}\li0\par")
        elif kind == "ol":
            parts.append(rf"\li360 {text}\li0\par")
        elif kind == "quote":
            parts.append(rf"\li540\i {text}\i0\li0\par")
        else:
            parts.append(rf"{text}\par")

    parts.append("}")
    DOC_OUT.write_text("\n".join(parts), encoding="utf-8")


def escape_pdf_text(text: str) -> str:
    return (
        clean_inline(text)
        .replace("\\", "\\\\")
        .replace("(", r"\(")
        .replace(")", r"\)")
    )


def block_to_lines(kind: str, text: str) -> list[tuple[str, int]]:
    width = 90
    if kind == "h1":
        return [(clean_inline(text), 18)]
    if kind == "h2":
        return [(clean_inline(text), 14)]
    if kind == "h3":
        return [(clean_inline(text), 12)]
    if kind == "ul":
        wrapped = textwrap.wrap(f"- {clean_inline(text)}", width=width)
        return [(line, 10) for line in wrapped]
    if kind == "ol":
        wrapped = textwrap.wrap(clean_inline(text), width=width)
        return [(line, 10) for line in wrapped]
    if kind == "quote":
        wrapped = textwrap.wrap(clean_inline(text), width=width - 4)
        return [(f"    {line}", 10) for line in wrapped]

    wrapped = textwrap.wrap(clean_inline(text), width=width)
    return [(line, 10) for line in wrapped] if wrapped else [("", 10)]


def build_pdf(blocks: list[tuple[str, str]]) -> None:
    PDF_OUT.parent.mkdir(parents=True, exist_ok=True)

    page_width = 612
    page_height = 792
    margin_left = 54
    margin_top = 60
    line_gap = 14
    bottom_limit = 54

    pages: list[list[tuple[str, int, int]]] = []
    current_page: list[tuple[str, int, int]] = []
    y = page_height - margin_top

    title_lines = [
        ("Receptionist AI Blueprint", 22, 0),
        ("Product, technology, and MVP planning document", 11, 1),
        ("", 10, 0),
    ]

    def new_page() -> None:
        nonlocal current_page, y
        if current_page:
            pages.append(current_page)
        current_page = []
        y = page_height - margin_top

    for line, size, center in title_lines:
        current_page.append((line, size, center))
        y -= line_gap + (size - 10)

    for kind, text in blocks:
        for line, size in block_to_lines(kind, text):
            needed = line_gap + max(size - 10, 0)
            if y < bottom_limit + needed:
                new_page()
            center = 0
            if kind == "h1":
                current_page.append(("", 10, 0))
            current_page.append((line, size, center))
            y -= needed
        y -= 4

    if current_page:
        pages.append(current_page)

    objects: list[bytes] = []

    def add_object(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    font_obj = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pages_ids: list[int] = []
    content_ids: list[int] = []

    for page_index, page in enumerate(pages, start=1):
        stream_lines = ["BT"]
        current_y = page_height - margin_top

        for text, size, center in page:
            if size == 22:
                current_y -= 10
            x = margin_left
            if center and text:
                approx_width = len(text) * (size * 0.42)
                x = max(margin_left, (page_width - approx_width) / 2)
            stream_lines.append(f"/F1 {size} Tf")
            stream_lines.append(f"1 0 0 1 {x:.2f} {current_y:.2f} Tm")
            stream_lines.append(f"({escape_pdf_text(text)}) Tj")
            current_y -= line_gap + max(size - 10, 0)

        footer = f"Page {page_index}"
        stream_lines.append("/F1 9 Tf")
        stream_lines.append(f"1 0 0 1 520 28 Tm ({footer}) Tj")
        stream_lines.append("ET")
        stream = "\n".join(stream_lines).encode("latin-1", errors="replace")
        content_id = add_object(
            f"<< /Length {len(stream)} >>\nstream\n".encode("latin-1")
            + stream
            + b"\nendstream"
        )
        content_ids.append(content_id)
        pages_ids.append(0)

    pages_tree_id = len(objects) + len(pages) + 1

    for idx, content_id in enumerate(content_ids):
        page_obj = add_object(
            (
                f"<< /Type /Page /Parent {pages_tree_id} 0 R "
                f"/MediaBox [0 0 {page_width} {page_height}] "
                f"/Resources << /Font << /F1 {font_obj} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode("latin-1")
        )
        pages_ids[idx] = page_obj

    kids = " ".join(f"{pid} 0 R" for pid in pages_ids)
    pages_obj = add_object(
        f"<< /Type /Pages /Kids [{kids}] /Count {len(pages_ids)} >>".encode("latin-1")
    )
    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode("latin-1"))

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{idx} 0 obj\n".encode("latin-1"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))

    trailer = (
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
        f"startxref\n{xref_start}\n%%EOF"
    )
    pdf.extend(trailer.encode("latin-1"))
    PDF_OUT.write_bytes(pdf)


def main() -> None:
    blocks = parse_markdown(SOURCE.read_text(encoding="utf-8").splitlines())
    build_rtf_doc(blocks)
    build_pdf(blocks)
    print(f"DOC created: {DOC_OUT}")
    print(f"PDF created: {PDF_OUT}")


if __name__ == "__main__":
    main()
