"""
Web AR (plane detection) — Flask server
---------------------------------------
เสิร์ฟหน้าเว็บ WebXR + three.js

WebXR บังคับ secure context:
  - localhost           -> ใช้ http ได้ (เทสบนเครื่องเดียวกัน)
  - เปิดบนมือถือจริง     -> ต้องเป็น HTTPS

รันแบบ HTTPS (self-signed) สำหรับทดสอบบนมือถือ:
    pip install flask pyopenssl
    python app.py --https
แล้วเปิด  https://<IP-เครื่องคุณ>:5000  บน Android Chrome
(ถ้าเตือนใบรับรองไม่ปลอดภัย ให้กด Advanced -> Proceed)

หรือใช้ ngrok แทน HTTPS:
    python app.py
    ngrok http 5000
"""
import argparse
import socket
from flask import Flask, render_template

app = Flask(__name__)


@app.route("/")
def index():
    # หน้าหลัก: model-viewer — ใช้ได้ทั้ง iOS (AR Quick Look) และ Android (Scene Viewer)
    return render_template("mv.html")


@app.route("/webxr")
def webxr():
    # เวอร์ชัน WebXR + three.js (Android Chrome เท่านั้น) — custom plane detection
    return render_template("index.html")


# ปิด cache เพื่อให้แก้ไฟล์แล้วเห็นผลทันทีตอน dev
@app.after_request
def add_header(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


def get_local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def print_qr(url: str) -> None:
    """พิมพ์ QR code ลง terminal ให้มือถือสแกนเชื่อมได้เลย (ถ้ามี lib qrcode)"""
    try:
        import qrcode
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
        print(f"  ^ สแกน QR นี้ด้วยกล้องมือถือ -> {url}")
    except ImportError:
        print("  (ติดตั้ง `pip install qrcode` เพื่อแสดง QR code ให้สแกน)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--https", action="store_true",
                        help="รันด้วย self-signed HTTPS (ต้อง pip install pyopenssl)")
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()

    ip = get_local_ip()
    scheme = "https" if args.https else "http"
    phone_url = f"{scheme}://{ip}:{args.port}"
    print("=" * 56)
    print(f"  เปิดบนเครื่องนี้ : {scheme}://localhost:{args.port}")
    print(f"  เปิดบนมือถือ    : {phone_url}")
    if not args.https:
        print("  * มือถือต้องใช้ HTTPS -> รันใหม่ด้วย:  python app.py --https")
    print("=" * 56)
    print("  ** มือถือต้องอยู่ WiFi เดียวกับเครื่องนี้ **")
    print_qr(phone_url)
    print("=" * 56)

    ssl_context = "adhoc" if args.https else None
    # use_reloader=False กัน process ซ้อน/QR พิมพ์สองรอบ
    app.run(host="0.0.0.0", port=args.port, debug=False,
            use_reloader=False, ssl_context=ssl_context)
