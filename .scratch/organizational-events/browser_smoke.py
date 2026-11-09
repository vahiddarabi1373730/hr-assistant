"""UI smoke with synthetic HTTP fixtures; API/database tests cover real storage."""

import json
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).parent
BASE = "http://127.0.0.1:5173"
USER = "1f92103c-845b-4c7f-8ac0-bdc5bb90a451"
ORG = "09bc0189-97b4-467d-a381-1f405a2b2203"
EVENT = "32e391e7-9082-4181-bb12-4c0c7048f919"
GUEST = "2cef8381-dc6e-45ce-a961-9c068363a3b8"
TASK = "7dabda2a-011e-40b1-a101-edf77df17422"
TOKEN = ORG + "." + "s" * 43
state = {"event": None}


def api(route):
    path = urlsplit(route.request.url).path
    method = route.request.method
    payload = route.request.post_data_json if route.request.post_data else {}
    event = state["event"]
    status = 200
    if path == "/api/me":
        body = {"id": USER, "email": "organiser@example.com", "role": "admin", "org": {"id": ORG, "name": "سازمان آزمایشی", "slug": "test"}}
    elif path == "/api/pipeline/owners":
        body = {"items": [{"id": USER, "email": "organiser@example.com", "active": True}]}
    elif path == "/api/notifications":
        body = {"items": [], "unread_count": 0}
    elif path == "/api/events" and method == "GET":
        body = {"items": [{**event, "guest_count": len(event["guests"]), "accepted_count": sum(g["response"] == "accepted" for g in event["guests"])}] if event else []}
    elif path == "/api/events" and method == "POST":
        state["event"] = {**payload, "id": EVENT, "organiser_id": USER, "status": "draft", "revision": 1, "created_at": datetime.now().isoformat(), "can_manage": True, "guests": [], "tasks": []}
        body, status = state["event"], 201
    elif path == f"/api/events/{EVENT}":
        if method == "PUT":
            event.update(payload)
            event["revision"] += 1
        body = event
    elif path == f"/api/events/{EVENT}/status":
        event["status"] = payload["status"]
        event["revision"] += 1
        body = event
    elif path == f"/api/events/{EVENT}/guests":
        body = {**payload, "id": GUEST, "response": "pending", "attended": False, "rating": None, "feedback": None}
        event["guests"].append(body)
        status = 201
    elif path.endswith(f"/guests/{GUEST}/link"):
        body = {"url": f"{BASE}/event-rsvp/{TOKEN}"}
    elif path == f"/api/events/{EVENT}/tasks":
        body = {**payload, "id": TASK, "done": False}
        event["tasks"].append(body)
        status = 201
    elif path.endswith(f"/tasks/{TASK}"):
        event["tasks"][0]["done"] = payload["done"]
        body = event["tasks"][0]
    elif path.startswith("/api/event-rsvp/"):
        guest = event["guests"][0]
        if method == "POST":
            guest["response"] = payload["response"]
        body = {**{k: event[k] for k in ("title", "description", "location", "starts_at", "ends_at", "status")}, "guest_name": guest["name"], "response": guest["response"], "can_respond": event["status"] == "published", "can_feedback": False, "rating": None, "feedback": None}
    else:
        body = {"review_count": 0, "items": []}
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="fa-IR")
    context.route("**/api/**", api)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.goto(BASE + "/events")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name="رویدادهای سازمانی")).to_be_visible()
        page.get_by_role("button", name="رویداد جدید", exact=True).click()
        page.get_by_label("عنوان رویداد", exact=True).fill("دورهمی تیم محصول")
        page.get_by_label("دربارهٔ رویداد", exact=True).fill("مرور فصل گذشته و گفت‌وگو دربارهٔ ایده‌های تیم")
        start = datetime.now() + timedelta(days=5)
        page.locator("#event-start").fill(start.strftime("%Y-%m-%dT18:00"))
        page.locator("#event-end").fill(start.strftime("%Y-%m-%dT20:00"))
        page.get_by_label("محل برگزاری یا لینک جلسه").fill("سالن گردهمایی شرکت")
        page.get_by_label("ظرفیت مهمان‌ها").fill("30")
        page.get_by_label("بودجهٔ برنامه‌ریزی‌شده (تومان)").fill("5000000")
        page.get_by_role("button", name="ساخت پیش‌نویس", exact=True).click()
        expect(page.get_by_role("heading", name="دورهمی تیم محصول", exact=True)).to_be_visible()
        page.get_by_role("button", name="انتشار رویداد", exact=True).click()
        page.get_by_role("dialog").get_by_role("button", name="تأیید", exact=True).click()
        expect(page.get_by_role("button", name="انتشار رویداد", exact=True)).to_have_count(0)
        page.locator("#guest-name").fill("سارا احمدی")
        page.locator("#guest-email").fill("sara@example.com")
        page.get_by_role("button", name="افزودن مهمان", exact=True).click()
        expect(page.get_by_text("سارا احمدی", exact=True)).to_be_visible()
        page.locator("#task-title").fill("هماهنگی پذیرایی")
        page.get_by_role("button", name="افزودن کار", exact=True).click()
        expect(page.get_by_text("هماهنگی پذیرایی", exact=True)).to_be_visible()
        page.get_by_role("button", name="تکمیل هماهنگی پذیرایی", exact=True).click()
        expect(page.get_by_role("button", name="بازگشایی هماهنگی پذیرایی", exact=True)).to_be_visible()
        page.get_by_role("button", name="لینک دعوت تازه", exact=True).click()
        expect(page.get_by_label("لینک شخصی دعوت")).to_have_value(BASE + "/event-rsvp/" + TOKEN)
        page.get_by_role("dialog").get_by_role("button", name="بستن پنجره").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.screenshot(path=str(ROOT / "event-desktop.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=str(ROOT / "event-mobile.png"), full_page=True)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile horizontal overflow"
        page.goto(BASE + "/event-rsvp/" + TOKEN)
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="شرکت می‌کنم", exact=True).click()
        expect(page.get_by_role("status")).to_have_text("حضور شما تأیید شد.")
        page.screenshot(path=str(ROOT / "rsvp-mobile.png"), full_page=True)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert not errors, errors
        print("PASS: create/publish, guest, checklist, invitation, RSVP, mobile overflow, no browser errors")
    except Exception:
        page.screenshot(path=str(ROOT / "browser-failure.png"), full_page=True)
        raise
    finally:
        browser.close()
