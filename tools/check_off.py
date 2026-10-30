"""Compare Foodle's ingredient lists with Open Food Facts (US products).

Usage:  python tools/check_off.py [output.json] [--new]

--new keeps the existing report and only checks products it doesn't list yet.

For each product in products.js, searches Open Food Facts for US matches,
pulls their English ingredient text, and reports the closest match with a
word-overlap score (1.0 = same words). Low scores are the ones to review.
"""
import json, re, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

UA = "Foodle/0.1 (ingredient check; github.com/BasqueAttack/foodle)"
ROOT = Path(__file__).resolve().parent.parent


def load_products():
    # products.js is plain JavaScript, so let Node read it (needs Node installed).
    script = "global.window={};require(process.argv[1]);process.stdout.write(JSON.stringify(window.FOODLE_PRODUCTS))"
    raw = subprocess.run(["node", "-e", script, str(ROOT / "products.js")],
                         capture_output=True, check=True).stdout
    return json.loads(raw.decode("utf-8"))


def get(url, tries=4):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))  # rate limited or busy; back off


def words(text):
    text = re.sub(r"\b(contains|less|than|or|of|the|and|following|each|to|for|a|as|2%|1%)\b", " ", text.lower())
    return set(re.findall(r"[a-z][a-z0-9]+", text))


def score(a, b):
    wa, wb = words(a), words(b)
    return round(len(wa & wb) / max(1, len(wa | wb)), 3)


def search(name):
    q = re.sub(r"\(.*?\)", "", name).replace("&", "and")
    url = "https://search.openfoodfacts.org/search?" + urllib.parse.urlencode({
        "q": f'{q} countries_tags:"en:united-states"',
        "page_size": 5,
        "fields": "code,product_name,brands",
    })
    return get(url).get("hits", [])


def ingredients(code):
    url = f"https://world.openfoodfacts.org/api/v2/product/{code}?fields=product_name,brands,ingredients_text_en,ingredients_text"
    p = get(url).get("product", {})
    return p.get("ingredients_text_en") or p.get("ingredients_text") or ""


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only_new = "--new" in sys.argv
    out = Path(args[0]) if args else ROOT / "tools" / "off_report.json"
    report = []
    if only_new and out.exists():
        # Keep earlier results and only check products the report doesn't have yet.
        report = json.loads(out.read_text(encoding="utf-8"))
    done = {r["name"] for r in report}
    for prod in load_products():
        if prod["name"] in done:
            continue
        best = {"name": prod["name"], "score": 0, "code": None, "off_name": None, "off_text": ""}
        try:
            for hit in search(prod["name"]):
                time.sleep(0.7)
                text = ingredients(hit["code"])
                if not text:
                    continue
                s = score(prod["ingredients"], text)
                if s > best["score"]:
                    best.update(score=s, code=hit["code"], off_name=hit.get("product_name"), off_text=text)
        except Exception as e:  # keep going; note the failure
            best["error"] = str(e)
        note = f'  ERROR: {best["error"]}' if "error" in best else ""
        print(f'{best["score"]:.2f}  {prod["name"]}  ->  {best["off_name"]} ({best["code"]}){note}', flush=True)
        report.append(best)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        time.sleep(1)
    print("wrote", out)


if __name__ == "__main__":
    main()
