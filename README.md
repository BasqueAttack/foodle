# Foodle

Read the ingredient list and guess the ultraprocessed food. There's a new daily puzzle every day, plus unlimited practice rounds.

Each wrong guess gets a row of tiles, one for each attribute:

| Attribute | Example | Tile colors |
|---|---|---|
| Category | Beverage, Candy, Breakfast… | green = match |
| Color | Orange, Brown, Red… (can be several) | green = exact, yellow = some colors overlap |
| Taste | Sweet, Salty, Savory, Sour, Spicy | green = match |
| Storage | Pantry, Fridge, Freezer, Restaurant | green = match |
| Package | Can, Bag, Box, Jar… (can be several) | green = exact, yellow = overlap |
| Year | Year the brand launched | green = exact, yellow = within 10 years, ↑/↓ = answer is newer/older |
| Company | Current US parent company | green = match |

## Files

- `index.html`: page structure
- `style.css`: look and layout
- `game.js`: game logic (daily puzzle, practice, hints, stats)
- `products.js`: the 100 foods. Edit this file to add or fix products.
- `tools/check_off.py`: compares every ingredient list with Open Food Facts

## Run it locally

You can open `index.html` directly in a browser. To run a local server instead:

```bash
python -m http.server 8000
```

Then go to http://localhost:8000.

## Check ingredient lists

```bash
python tools/check_off.py
```

This writes `tools/off_report.json`, which lists the closest Open Food Facts match for each product and a word-overlap score. Review the low scores against the actual package.

## Host it on GitHub Pages

In the repo on GitHub, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and pick `main` / `(root)`. The site goes live at `https://<username>.github.io/foodle/`.

## Data

Ingredient lists are US labels, checked against [Open Food Facts](https://world.openfoodfacts.org), whose data is available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Recipes change over time, so a current package may differ.
