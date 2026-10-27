"""Compare Foodle's ingredient lists with Open Food Facts (US products).

Usage:  python tools/check_off.py [output.json]

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


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


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
        "page_size": 8,
        "fields": "code,product_name,brands",
    })
    return get(url).get("hits", [])


def ingredients(code):
    url = f"https://world.openfoodfacts.org/api/v2/product/{code}?fields=product_name,brands,ingredients_text_en,ingredients_text"
    p = get(url).get("product", {})
    return p.get("ingredients_text_en") or p.get("ingredients_text") or ""


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tools" / "off_report.json"
    report = []
    for prod in load_products():
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
        print(f'{best["score"]:.2f}  {prod["name"]}  ->  {best["off_name"]} ({best["code"]})', flush=True)
        report.append(best)
        time.sleep(1)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    main()
