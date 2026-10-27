"""Doc cac file Wayground_*.xlsx va sinh questions.js (chay: python tools/build_questions.py)."""
import glob, json, os
import openpyxl

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
questions = []
for f in sorted(glob.glob(os.path.join(root, "Wayground_*.xlsx"))):
    ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]
    name = os.path.basename(f)
    for i, r in enumerate(ws.iter_rows(values_only=True), start=1):
        if i < 3 or not r[0]:  # dong 1 header, dong 2 chu thich
            continue
        opts = [str(x).strip() for x in r[2:6] if x not in (None, "")]
        questions.append({
            "id": f"{name[-7:-5]}-{i}",
            "q": str(r[0]).strip(),
            "o": opts,
            "a": int(r[7]) - 1,
        })

assert all(len(q["o"]) == 4 and 0 <= q["a"] < 4 for q in questions)
out = os.path.join(root, "questions.js")
with open(out, "w", encoding="utf-8") as fh:
    fh.write("window.QUESTIONS = " + json.dumps(questions, ensure_ascii=False, indent=1) + ";\n")
print(len(questions), "questions ->", out)
