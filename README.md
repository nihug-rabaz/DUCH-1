# DUCH-1 Premium (דו״ח 1)

דשבורד פרימיום לדיווח נוכחות וסטטיסטיקות מול `one.prat.idf.il`.

## אפליקציה ראשית (Next.js)

הממשק החדש (UI כמו המקור: רקע `#F6E467`, Assistant/Oswald) נמצא בתיקייה `web/`:

```bash
cd web
npm install
npm run dev -- -p 3100 -H 127.0.0.1
```

פתחו: `http://127.0.0.1:3100` → `/login` (ת״ז → Microsoft → הדבקת `#code=`).

פרטים: [`web/README.md`](web/README.md).

## Legacy Flask

```bash
pip install -r requirements.txt
python app.py
```

`http://localhost:5000` — נשאר לתאימות; הפיתוח החדש ב-Next.

## מסכים

| נתיב | תפקיד |
|------|--------|
| `/login` | אשף התחברות + הדבקת Cookie |
| `/home` | סיכום סטטוס נוכחי |
| `/report` | דיווח מרוכז (פיצ׳ר A+B) |
| `/stats` | סטטיסטיקות וגרפים |

## API עיקרי

- `POST /api/session/validate` — אימות Cookie
- `POST /api/statuses` — מילון Main/Secondary
- `POST /api/report/bulk` — שליחת דיווחים עתידיים לפי רשימת תאריכים
- `POST /api/statistics` / `POST /api/export/csv` — קריאה / ייצוא

## מבנה

```
app.py
services/
  attendance_api_service.py
  future_reporter.py
  statistics_processor.py
static/css/app.css
static/js/session.js
static/js/report.js
templates/
  base.html, login.html, home.html, report.html, stats.html
```

## אבטחה

- אל תשתף Cookie עם אחרים
- Cookie נשלח ב-POST body לשרת המקומי בלבד לצורך פרוקסי ל-One Prat
- אין שמירת Cookie בשרת או ב-CSV

## רישיון

שימוש אישי בלבד.
