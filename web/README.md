# דו״ח 1 — Next.js

ממשק מקצועי בסגנון המקורי של [one.prat.idf.il](https://one.prat.idf.il) (רקע צהוב `#F6E467`, Assistant/Oswald, כפתורים לבנים עגולים).

## הרצה

```bash
cd web
npm install
npm run dev
```

פתחו: [http://127.0.0.1:3000](http://127.0.0.1:3000)

## מסכים

| נתיב | תפקיד |
|------|--------|
| `/login` | ת״ז → Microsoft PKCE → הדבקת `#code=` |
| `/home` | מסך בית כמו `/hp` במקור |
| `/calendar` | דיווחים עתידיים + ביטול |
| `/report` | דיווח מרוכז מעבר ל-7 ימים |
| `/stats` | סיכום מהיר |

Flask בתיקיית השורש נשאר כ-legacy; האפליקציה הראשית היא Next בתיקייה זו.
