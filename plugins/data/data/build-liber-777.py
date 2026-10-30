"""Convert adamblvck/open_777 liber_777.js into KABBAK's liber-777/data/liber-777.json.

Source: https://github.com/adamblvck/open_777 (MIT) — transcription of Liber 777
(1909, Aleister Crowley, public domain).

Shape:
  {
    "columns": [{"index": "II. Hebrew Names of the Paths", "numeral": "II", "title": "..."}],
    "keys": { "0": {"II. ...": "value", ...}, ... }
  }
Key mapping matches the source sheet directly (and the site's `key` param):
0 = Ain, 1–10 = Sephirot, 11–32 = Hebrew letter paths, 33 = Tav (Kether/earth
column XXXIII), 34 = Shin (Spirit, column XXXIV).
"""
import json
import re
import sys

SRC = sys.argv[1]
OUT = sys.argv[2]

PLACEHOLDERS = {"", "...", "…", "-", "—", "\u2026"}

raw = open(SRC, encoding="utf-8").read()
raw = raw[raw.index("["):].rstrip().rstrip(";")
rows = json.loads(raw)

NUMERAL_RE = re.compile(r"^([IVXLC]+(?:\.[IVXLC]+)?)\.\s*(.+)$", re.S)


def split_index(text):
    text = str(text or "").strip().replace("\r\n", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    m = NUMERAL_RE.match(text)
    if not m:
        return "", text
    return m.group(1), m.group(2).strip()


def clean(value):
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = re.sub(r"\n{2,}", "\n", text).strip()
    if re.fullmatch(r"-?\d+\.0+", text):
        text = text.split(".")[0]
    if text in PLACEHOLDERS or text.lower() == "none":
        return ""
    return text


numeral_priority = []

columns = []
seen = set()
for row in rows:
    index = row.get("index", "")
    numeral, title = split_index(index)
    key = index.strip()
    if key in seen:
        # Duplicate label earlier in the sheet (the dataset repeats a few
        # numerals with different content); keep both with a suffix.
        n = 2
        while f"{key} ({n})" in seen:
            n += 1
        key = f"{key} ({n})"
    seen.add(key)
    columns.append({"key": key, "numeral": numeral, "title": title})

keys = {}
for k in range(0, 35):
    column_key = str(k)
    values = {}
    for row, column in zip(rows, columns):
        value = clean(row.get(column_key))
        if value:
            values[column["key"]] = value
    if values:
        keys[column_key] = values

# The sheet puts the three veils of negative existence on three lines of the
# same cell in key "0". Split them into the site's own keys: 000 (Ain),
# 00 (Ain Soph), 0 (Ain Soph Aur).
veil_source = keys.get("0")
if veil_source and len(str(veil_source.get(
        "II. Transliteration of the Hebrew Names of the Paths", "")).split("\n")) >= 3:
    for veil_key, line_index in (("000", 0), ("00", 1), ("0", 2)):
        subset = {}
        for title, value in veil_source.items():
            parts = value.split("\n")
            subset[title] = parts[line_index] if len(parts) == 3 else value
        keys[veil_key] = subset
payload = {
    "meta": {
        "title": "Liber 777",
        "subtitle": "Correspondences of Aleister Crowley",
        "source": "https://github.com/adamblvck/open_777",
        "sourceLabel": "open_777 data set (MIT) — transcription of Liber 777 (1909, public domain)",
        "license": "MIT (dataset) / public domain (source text)",
        "credit": "Data: ADAM BLVCK — open_777. Source text: Aleister Crowley, 777. Spirit key row: Frater Achad / Liber Oz transcription.",
        "keyNote": "Key 0 = Ain, 1–10 = Sephirot, 11–32 = Hebrew letter paths, 33/34 = Kether- and Shin-tables (columns XXXIII/XXXIV of the book)."
    },
    "columns": columns,
    "keys": keys,
}

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

print(f"columns={len(columns)} keys={len(keys)} bytes={len(json.dumps(payload, ensure_ascii=False))}")
