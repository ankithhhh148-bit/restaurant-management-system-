#!/usr/bin/env python3
"""
Downloads a photo for every dish on your menu and saves it as static/images/<slug>.jpg
Sources (tried in order): Wikimedia Commons, then Openverse. Standard library only.

  python fetch_images.py              download missing photos
  python fetch_images.py --force      re-download everything
  python fetch_images.py --insecure   use if you see CERTIFICATE_VERIFY_FAILED

Half/Full variants share one photo ("Chilli Chicken (Half)" -> chilli-chicken.jpg).
Credits are written to static/images/CREDITS.txt.
"""
import json, os, re, sqlite3, ssl, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "static", "images")
UA = {"User-Agent": "RestaurantMS/1.0 (local demo app; contact: owner@example.com)"}
CTX = ssl._create_unverified_context() if "--insecure" in sys.argv else None
HINTS = {
    "Veg Burger": ["veggie burger", "vegetarian burger", "burger"],
    "Chicken Burger": ["chicken burger", "chicken sandwich", "burger"],
    "Chilli Chicken": ["chilli chicken", "chili chicken", "indo chinese chicken"],
    "Tandoori Chicken": ["tandoori chicken", "tandoori"],
    "Hot Coffee": ["cup of coffee", "coffee cup", "latte"],
    "Cold Coffee": ["iced coffee", "cold coffee", "frappe"],
    "Cheese Pasta": ["cheese pasta", "macaroni cheese", "pasta"],
    "Normal Pasta": ["spaghetti pasta", "pasta tomato sauce", "pasta"],
}
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def get(url, binary=False, tries=3):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40, context=CTX) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and n < tries - 1:
                time.sleep(3 * (n + 1)); continue
            raise


def commons(term):
    q = {"action": "query", "format": "json", "generator": "search", "gsrsearch": term,
         "gsrnamespace": 6, "gsrlimit": 25, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 900}
    pages = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(q)).get("query", {}).get("pages", {})
    for p in sorted(pages.values(), key=lambda p: p.get("index", 99)):
        i = (p.get("imageinfo") or [{}])[0]
        if i.get("mime") != "image/jpeg" or i.get("width", 0) < 500:
            continue
        m = i.get("extmetadata", {})
        yield (i.get("thumburl") or i["url"], p["title"], re.sub("<[^>]+>", "", m.get("Artist", {}).get("value", "unknown")),
               m.get("LicenseShortName", {}).get("value", "see Commons"))


def openverse(term):
    q = {"q": term, "page_size": 15, "category": "photograph", "license_type": "commercial"}
    for r in get("https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(q)).get("results", []):
        url = r.get("thumbnail") or r.get("url")
        if url:
            yield (url, r.get("title") or term, r.get("creator") or "unknown", f"{r.get('license','')} {r.get('license_version','')}".strip())


def save(path, url):
    data = get(url, True)
    if data[:2] != b"\xff\xd8" or len(data) < 5000:      # must be a real JPEG
        raise ValueError("not a jpeg")
    with open(path, "wb") as f:
        f.write(data)


def main():
    force = "--force" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    print("Saving photos to:", OUT)
    db = sqlite3.connect(os.path.join(HERE, "rms.db"))
    bases = sorted({re.sub(r"\s*\(.*?\)\s*", "", n).strip() for (n,) in db.execute("SELECT name FROM menu")})
    credits, missing = [], []
    for base in bases:
        path = os.path.join(OUT, slug(base) + ".jpg")
        if os.path.exists(path) and not force:
            print(f"skip    {base} (already downloaded)"); continue
        done = False
        for source in (commons, openverse):
            for term in HINTS.get(base, [base, base + " food"]):
                try:
                    tried = 0
                    for url, title, author, lic in source(term):
                        tried += 1
                        if tried > 4: break
                        try:
                            save(path, url)
                            print(f"OK      {base}  <-  {source.__name__}: {title[:60]}")
                            credits.append(f"{slug(base)}.jpg | {title} | {author} | {lic} | {source.__name__}")
                            done = True; break
                        except Exception as e:
                            print(f"  retry {base}: {e}")
                except Exception as e:
                    print(f"  error {base} [{source.__name__}/{term}]: {e}")
                if done: break
                time.sleep(0.5)
            if done: break
        if not done:
            missing.append(base)
    if credits:
        with open(os.path.join(OUT, "CREDITS.txt"), "a", encoding="utf-8") as f:
            f.write("\n".join(credits) + "\n")
    print("\n==== SUMMARY ====")
    print("Photos in folder:", len([f for f in os.listdir(OUT) if f.endswith('.jpg')]), "of", len(bases))
    for b in missing:
        print(f"MISSING {b} -> put your own photo at {os.path.join(OUT, slug(b) + '.jpg')}")
    if missing:
        print("If every line above shows errors like CERTIFICATE_VERIFY_FAILED or timeout, run:  python fetch_images.py --insecure")
    print("Now restart the server and press Ctrl+F5 in the browser.")


if __name__ == "__main__":
    main()
