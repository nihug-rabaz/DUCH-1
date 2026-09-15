# מסמך סקירה ותוכנית עבודה - מערכת דו"ח 1 (One Prat)

## 🎯 מטרת העל והחזון
1. **מיפוי קודים וסטטוסים (MainCode & SecondaryCode):** הבנה מלאה של סוגי הדיווחים במערכת (נוכח בבסיס, חופשה שנתית, חופשת מחלה/גימלים, בתפקיד מחוץ ליחידה, חו"ל, דיווחי חירום וכו').
2. **אוטומציית דיווח עתידי מעבר למגבלת ה-UI (7 ימים):**
   - ממשק המשתמש (UI) של האתר מוגבל כיום לתזמון דיווח עד 7 ימים קדימה בלבד.
   - המטרה בסוף היא ליצור **מנגנון אוטומציה לדיווח עתידי אוטומטי** שרץ באופן רציף ואוטומטי, ועוקף/פורץ את מגבלת ה-7 ימים של ה-UI דרך קריאות API ישירות לנקודת הקצה (`InsertFutureReport`).
3. **שילוב בדשבורד:** הרחבת מערכת ה-Dashboard (`report1-dashboard`) לצפייה, מעקב ואוטומציית דיווחים.

---

## 🔍 ממצאי סקירה בפועל (מתוך המערכת)

להלן סקירה ממוספרת של הממצאים שאומתו ישירות במערכת:

### 1. מסך ראשי / סיכום דיווח
- **1.1.** מציג את שם המערכת: דו"ח 1
- **1.2.** מציג ברכת משתמש: שלום, ליעד משה
- **1.3.** מציג סטטוס דיווח שהתקבל ממפקד בשעה 10:15
- **1.4. הדיווח הנוכחי:**
  - ראשי: מחוץ ליחידה
  - משנה: בתפקיד מחוץ ליחידה
- **1.5. מגבלת עריכה:** לאחר שהתקבל דיווח אחראי/מפקד, אי אפשר לשנות את הדיווח.

### 2. תפריט צד
- **2.1.** כניסת מפקד
- **2.2.** דיווח נוכחות
- **2.3.** היסטוריית דיווחים
- **2.4.** הגדרות
- **2.5.** התנתקות

### 3. דיווחים עתידיים
- **3.1.** נפתח מסך לוח שנה בכתובת `/calendar`.
- **3.2. הטקסט במסך:**
  - "לתזמון דיווח עתידי נא לבחור תאריך"
  - "ניתן לערוך או למחוק דיווחים שתוזמנו"
- **3.3. תאריכים זמינים לבחירה בחודש ספטמבר 2026 (מגבלת UI של 7 ימים):** 16, 17, 18, 19, 20, 21, 22.
- **3.4. תאריך שכבר יש עליו דיווח:**
  - `16.09.2026` | יום רביעי (יישלח בעוד יום אחד)
  - ראשי: חופשת מחלה
  - משנה: חופשת מחלה (גימלים)
- **3.5. פעולות על דיווח עתידי קיים:**
  - עריכת דיווח
  - קישור לדיווח על אירוע חריג: לחץ כאן
  - מחיקת דיווח

### 4. סוגי דיווחים ראשיים שזוהו (`MainCode`)
- **4.1.** מחוץ ליחידה
- **4.2.** חופשה שנתית
- **4.3.** חופשת מחלה
- **4.4.** חו"ל
- **4.5.** נמצא/ת ביחידה (הופיע במסך העריכה)
- **4.6.** דיווחי חירום (הופיע במסך העריכה)

### 5. תתי-דיווחים שאומתו (`SecondaryCode`)
- **5.1. מחוץ ליחידה:** בתפקיד מחוץ ליחידה
- **5.2. חופשת מחלה:** חופשת מחלה (גימלים)

### 6. היסטוריית דיווחים והגדרות
- **6.1.** נסיונות גלישה ל-`/history` ו-`/settings` הפנו למסך התחברות (`/login`).
- **6.2. במסך ההתחברות זוהו:** שדה תעודת זהות, כפתור כניסה (לא פעיל ללא קלט), קישור/טקסט `my.idf.il`, קישור/טקסט תמיכה `go.idf.il/support`.

---

## 📡 מבנה בקשת ה-cURL לדיווח עתידי (`InsertFutureReport`)

קריאת ה-API לביצוע דיווח עתידי:

```bash
curl --url 'https://one.prat.idf.il/api/Attendance/InsertFutureReport' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'accept-language: he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7' \
  -H 'access-control-allow-origin: *' \
  -H 'content-type: multipart/form-data; boundary=----WebKitFormBoundaryGT2N0WXGJroljAhp' \
  -b 'BIGipServerMFT-One-Frontends=1421160970.20480.0000; visid_incap_2025883=wMyUbYToTDiRJwWl345Mldo8qWoAAAAAQUIPAAAAAAC5MUfm5FvIqJR+ZWJiJ8pg; nlbi_2025883=rM1zO2XsqDibnwtyNh3FqAAAAAAV8tz+PfqTQK/Ysjj1yCfl; incap_ses_73_2025883=SyhSOB8aplaaK1S0KFkDAdo8qWoAAAAAPg6ffr/ROZJbXJ3nxt6CpA==; AppCookie=CfDJ8CV_6rJ6E9BOm4EbAucY42YzQbpmfe4AMOeLVSaCf7RYRDxtW8b3Tmrn3VjKckvAhD7xHKq_5gsT8mfaJrRbZupzuLjcCSScYkAh6W-RjVy0WLvRMGXRVoXVLUAaSCf-mb4hiY-jtfHmmiZ2rqBV5imR9x1OSSaC1xnnCI2nCmgR-blEIVYX-7getFq4vfqDBF3bSjCQLlATXIt_Ee5KLS3es-PTR8SmRGrR_AxBRSGzRlvf6QZriL9-qirxmOW9jtBuKACGgfXwxMu9bonwxJOc4SxokvYrFXm2bqy9YSuALA3oHYWil69aRmIZjNHr0eutVPF090QThc9l2oVqwFdaHc6KbK7Kt5TsUItQbpCi' \
  -H 'crossdomain: true' \
  -H 'origin: https://one.prat.idf.il' \
  -H 'pragma: no-cache' \
  -H 'priority: u=1, i' \
  -H 'referer: https://one.prat.idf.il/uploadFiles' \
  -H 'sec-ch-ua: "Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"' \
  -H 'sec-ch-ua-mobile: ?1' \
  -H 'sec-ch-ua-platform: "iOS"' \
  -H 'sec-fetch-dest: empty' \
  -H 'sec-fetch-mode: cors' \
  -H 'sec-fetch-site: same-origin' \
  -H 'user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' \
  --data-raw $'------WebKitFormBoundaryGT2N0WXGJroljAhp\r\nContent-Disposition: form-data; name="MainCode"\r\n\r\n05\r\n------WebKitFormBoundaryGT2N0WXGJroljAhp\r\nContent-Disposition: form-data; name="SecondaryCode"\r\n\r\n01\r\n------WebKitFormBoundaryGT2N0WXGJroljAhp\r\nContent-Disposition: form-data; name="Note"\r\n\r\n\r\n------WebKitFormBoundaryGT2N0WXGJroljAhp\r\nContent-Disposition: form-data; name="FutureReportDate"\r\n\r\n16.09.2026\r\n------WebKitFormBoundaryGT2N0WXGJroljAhp--\r\n'
```

### פירוט פרמטרים של הבקשה (`multipart/form-data`):
- `MainCode`: קוד דיווח ראשי (לדוגמה `05` = מחוץ ליחידה / בתפקיד).
- `SecondaryCode`: קוד דיווח משני (לדוגמה `01` = בתפקיד מחוץ ליחידה).
- `Note`: הערה חופשית.
- `FutureReportDate`: תאריך בפורמט `DD.MM.YYYY` (לדוגמה `16.09.2026`).

---

## 🛠️ תוכנית המשך לפיתוח האוטומציה
1. **הוספת מודול אוטומציית דיווח (`FutureReporter`):** בניה של שירות ב-Python שיודע לשלוח לבקשת `InsertFutureReport` תאריכים מתוזמנים.
2. **מעקף מגבלת ה-7 ימים:** בדיקה מול נקודת הקצה שליחת דיווחים עתידיים מעבר ל-7 ימים (14 יום/חודש קדימה) דרך האוטומציה.
3. **ניהול Cookie תקין והתראות:** שילוב בדשבורד לקבלת התראות על סיום תוקף ה-Cookie וביצוע רענון.
