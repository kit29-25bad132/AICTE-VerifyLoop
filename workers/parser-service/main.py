import fitz
import json
import os
import base64
import io
import pytesseract
from PIL import Image
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

def extract_with_coords(pdf_path: str) -> dict:
    doc = fitz.open(pdf_path)
    pages, total_words = [], 0
    for page_num, page in enumerate(doc):
        page_data = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] == 0:
                for line in block["lines"]:
                    for span in line["spans"]:
                        page_data.append({"text": span["text"], "bbox": span["bbox"], "page": page_num + 1})
                        total_words += len(span["text"].split())
        pages.append(page_data)
    needs_ocr = total_words < len(doc) * 50
    page_images = []
    if needs_ocr:
        for page in doc:
            page_images.append(base64.b64encode(page.get_pixmap(dpi=150).tobytes("png")).decode("ascii"))
    return {"pages": pages, "total_words": total_words, "page_count": len(doc), "needs_ocr": needs_ocr, "page_images": page_images}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if urlparse(self.path).path == "/health": self._json(200, {"status": "ok"})
        else: self._json(404, {"error": "Not found"})
    def do_POST(self):
        endpoint = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        if endpoint == "/ocr":
            try:
                image = Image.open(io.BytesIO(base64.b64decode(body["image_base64"])))
                self._json(200, {"text": pytesseract.image_to_string(image, lang="eng+hin+tam")})
            except Exception:
                self._json(500, {"error": "OCR failed"})
            return
        if endpoint != "/extract": self._json(404, {"error": "Not found"}); return
        pdf_path = body.get("pdf_path", "")
        if not os.path.exists(pdf_path): self._json(404, {"error": "File not found"}); return
        try: self._json(200, extract_with_coords(pdf_path))
        except Exception as exc: self._json(500, {"error": str(exc)})

if __name__ == "__main__":
    HTTPServer(("0.0.0.0", int(os.environ.get("PARSER_PORT", 8002))), Handler).serve_forever()
