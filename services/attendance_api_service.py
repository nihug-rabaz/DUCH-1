import requests
import json
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple


class AttendanceAPIService:
    BASE = "https://one.prat.idf.il"

    def __init__(self, cookie: str = None):
        if not cookie:
            raise ValueError("Cookie is required for authentication")
        self.cookie = cookie
        self.headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7,ar;q=0.6',
            'access-control-allow-origin': '*',
            'cache-control': 'no-cache',
            'content-type': 'application/json;charset=UTF-8',
            'crossdomain': 'true',
            'origin': 'https://one.prat.idf.il',
            'pragma': 'no-cache',
            'priority': 'u=1, i',
            'referer': 'https://one.prat.idf.il/history',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
            'Cookie': cookie
        }

    def _headers(self, content_type: Optional[str] = None, referer: Optional[str] = None) -> Dict[str, str]:
        headers = dict(self.headers)
        if content_type is not None:
            if content_type:
                headers['content-type'] = content_type
            else:
                headers.pop('content-type', None)
        if referer:
            headers['referer'] = referer
        return headers

    def validate_session(self) -> Tuple[bool, Dict[str, Any]]:
        try:
            status, data = self.get_filter_statuses(raw=True)
            if status == 401 or status == 403:
                return False, {'auth_expired': True, 'error': 'הסשן פג תוקף'}
            if status >= 400:
                return False, {'error': f'אימות נכשל ({status})', 'auth_expired': status in (401, 403)}
            user_name = ''
            try:
                resp = requests.get(
                    f'{self.BASE}/api/account/getUser',
                    headers=self._headers(content_type=''),
                    timeout=20
                )
                if resp.ok:
                    user = resp.json()
                    if isinstance(user, dict):
                        user_name = (
                            user.get('fullName')
                            or user.get('name')
                            or user.get('displayName')
                            or ''
                        )
            except requests.RequestException:
                pass
            return True, {'user_name': user_name, 'statuses': data}
        except Exception as e:
            return False, {'error': str(e)}

    def get_filter_statuses(self, raw: bool = False):
        try:
            response = requests.get(
                f'{self.BASE}/api/Attendance/GetAllFilterStatuses',
                headers=self._headers(content_type='', referer='https://one.prat.idf.il/hp'),
                timeout=30
            )
            if raw:
                try:
                    body = response.json() if response.content else {}
                except (ValueError, json.JSONDecodeError):
                    body = {}
                return response.status_code, body
            response.raise_for_status()
            data = response.json()
            if isinstance(data, str):
                data = json.loads(data)
            return data
        except requests.RequestException:
            if raw:
                return 500, {}
            return {}
        except (ValueError, TypeError, json.JSONDecodeError):
            if raw:
                return 500, {}
            return {}

    def get_reported_data(self) -> Dict[str, Any]:
        try:
            response = requests.get(
                f'{self.BASE}/api/Attendance/GetReportedData',
                headers=self._headers(content_type='', referer='https://one.prat.idf.il/hp'),
                timeout=30
            )
            if response.status_code in (401, 403):
                return {'auth_expired': True}
            response.raise_for_status()
            data = response.json()
            if isinstance(data, str):
                data = json.loads(data)
            return data if isinstance(data, dict) else {'data': data}
        except requests.RequestException:
            return {}
        except (ValueError, TypeError, json.JSONDecodeError):
            return {}

    @staticmethod
    def _normalize_day_date(raw: Any) -> str:
        if not raw:
            return ''
        text = str(raw).strip()
        try:
            if 'T' in text:
                text = text.split('T')[0]
            if '.' in text and text.count('.') == 2:
                dt = datetime.strptime(text[:10], '%d.%m.%Y')
            else:
                dt = datetime.strptime(text[:10], '%Y-%m-%d')
            return dt.strftime('%Y-%m-%d')
        except (ValueError, TypeError):
            return ''

    @staticmethod
    def _day_has_report(day: Dict) -> bool:
        code = day.get('reportedStatusCode') or day.get('statusCode') or ''
        main = day.get('reportedMainName') or day.get('mainStatusReported') or ''
        secondary = day.get('secondaryStatusReported') or day.get('reportedSecondaryName') or ''
        return bool(str(code).strip() or str(main).strip() or str(secondary).strip())

    def get_future_reports_month(self, month: int, year: int) -> Dict[str, Any]:
        try:
            response = requests.post(
                f'{self.BASE}/api/Attendance/getFutureReport',
                headers=self._headers(referer='https://one.prat.idf.il/calendar'),
                json={'month': int(month), 'year': int(year)},
                timeout=30
            )
            if response.status_code in (401, 403):
                return {'ok': False, 'auth_expired': True, 'reports': [], 'error': 'הסשן פג תוקף'}
            response.raise_for_status()
            data = response.json()
            if isinstance(data, str):
                data = json.loads(data)
            days = []
            if isinstance(data, dict):
                days = data.get('days') or []
            elif isinstance(data, list):
                days = data
            reports = []
            for day in days:
                if not isinstance(day, dict) or not self._day_has_report(day):
                    continue
                iso = self._normalize_day_date(day.get('date') or day.get('Date'))
                if not iso:
                    continue
                reports.append({
                    'date': iso,
                    'date_prat': datetime.strptime(iso, '%Y-%m-%d').strftime('%d.%m.%Y'),
                    'main': day.get('reportedMainName') or day.get('mainStatusReported') or '',
                    'secondary': day.get('secondaryStatusReported') or day.get('reportedSecondaryName') or '',
                    'status_code': day.get('reportedStatusCode') or '',
                    'icon': day.get('icon'),
                    'raw': day,
                })
            return {
                'ok': True,
                'reports': reports,
                'auth_expired': False,
                'minDate': data.get('minDate') if isinstance(data, dict) else None,
                'maxDate': data.get('maxDate') if isinstance(data, dict) else None,
            }
        except requests.RequestException as e:
            return {'ok': False, 'reports': [], 'error': str(e)}
        except (ValueError, TypeError, json.JSONDecodeError) as e:
            return {'ok': False, 'reports': [], 'error': str(e)}

    def get_future_reports(self, months_ahead: int = 2) -> Dict[str, Any]:
        """
        Fetch scheduled future reports for current month + following months.
        API requires body {month, year} — empty body returns nothing useful.
        """
        now = datetime.now()
        all_reports: List[Dict] = []
        seen = set()
        min_date = None
        max_date = None
        for offset in range(max(1, months_ahead)):
            month = now.month + offset
            year = now.year
            while month > 12:
                month -= 12
                year += 1
            payload = self.get_future_reports_month(month, year)
            if payload.get('auth_expired'):
                return payload
            if not payload.get('ok'):
                return payload
            if payload.get('minDate') and not min_date:
                min_date = payload.get('minDate')
            if payload.get('maxDate'):
                max_date = payload.get('maxDate')
            for report in payload.get('reports') or []:
                key = report.get('date')
                if key and key not in seen:
                    seen.add(key)
                    all_reports.append(report)
        all_reports.sort(key=lambda r: r.get('date') or '')
        return {
            'ok': True,
            'reports': all_reports,
            'auth_expired': False,
            'minDate': min_date,
            'maxDate': max_date,
        }

    def delete_future_report(self, date_prat: str) -> Dict[str, Any]:
        """
        date_prat format: DD.MM.YYYY
        POST /api/Attendance/deleteFutureReport?dateToDelete=...
        """
        try:
            url = (
                f'{self.BASE}/api/Attendance/deleteFutureReport'
                f'?dateToDelete={date_prat}'
            )
            response = requests.post(
                url,
                headers=self._headers(content_type='', referer='https://one.prat.idf.il/calendar'),
                timeout=30
            )
            if response.status_code in (401, 403):
                return {
                    'ok': False,
                    'status': 'auth_expired',
                    'http_status': response.status_code,
                    'message': 'הסשן פג תוקף'
                }
            body_json = None
            body_text = ''
            try:
                body_json = response.json()
            except (ValueError, json.JSONDecodeError):
                body_text = (response.text or '')[:300]
            if response.ok:
                return {
                    'ok': True,
                    'status': 'success',
                    'http_status': response.status_code,
                    'message': 'הדיווח נמחק',
                    'response': body_json if body_json is not None else body_text
                }
            message = ''
            if isinstance(body_json, dict):
                message = body_json.get('message') or body_json.get('error') or str(body_json)
            else:
                message = body_text or f'שגיאה ({response.status_code})'
            return {
                'ok': False,
                'status': 'rejected',
                'http_status': response.status_code,
                'message': message
            }
        except requests.RequestException as e:
            return {'ok': False, 'status': 'rejected', 'http_status': 0, 'message': str(e)}

    def insert_future_report(
        self,
        main_code: str,
        secondary_code: str,
        future_report_date: str,
        note: str = ''
    ) -> Dict[str, Any]:
        """
        future_report_date format: DD.MM.YYYY
        """
        try:
            files = {
                'MainCode': (None, str(main_code)),
                'SecondaryCode': (None, str(secondary_code)),
                'Note': (None, note or ''),
                'FutureReportDate': (None, str(future_report_date)),
            }
            headers = self._headers(content_type='', referer='https://one.prat.idf.il/uploadFiles')
            response = requests.post(
                f'{self.BASE}/api/Attendance/InsertFutureReport',
                headers=headers,
                files=files,
                timeout=45
            )
            body_text = ''
            body_json = None
            try:
                body_json = response.json()
            except (ValueError, json.JSONDecodeError):
                body_text = (response.text or '')[:500]

            if response.status_code in (401, 403):
                return {
                    'ok': False,
                    'status': 'auth_expired',
                    'http_status': response.status_code,
                    'message': 'הסשן פג תוקף'
                }

            # Upstream returns HTTP 200 with JSON true/false — false means not
            # persisted (dates beyond ~7-day write window). Bare OK is not success.
            if response.ok and body_json is True:
                return {
                    'ok': True,
                    'status': 'success',
                    'http_status': response.status_code,
                    'message': 'הדיווח נשמר',
                    'response': body_json,
                }

            if response.ok and body_json is False:
                return {
                    'ok': False,
                    'status': 'rejected',
                    'http_status': response.status_code,
                    'message': 'התאריך מחוץ לחלון הדיווח העתידי (כשבוע קדימה)',
                    'response': body_json,
                }

            message = ''
            if isinstance(body_json, dict):
                message = (
                    body_json.get('message')
                    or body_json.get('error')
                    or body_json.get('title')
                    or str(body_json)
                )
            elif body_json is not None:
                message = str(body_json)
            else:
                message = body_text or f'שגיאה מהשרת ({response.status_code})'

            return {
                'ok': False,
                'status': 'rejected',
                'http_status': response.status_code,
                'message': message,
                'response': body_json if body_json is not None else body_text
            }
        except requests.RequestException as e:
            return {
                'ok': False,
                'status': 'rejected',
                'http_status': 0,
                'message': str(e)
            }

    def fetch_month_data(self, month: int, year: int) -> List[Dict]:
        payload = {"month": month, "year": year}
        try:
            response = requests.post(
                f'{self.BASE}/api/Attendance/memberHistory',
                headers=self._headers(referer='https://one.prat.idf.il/history'),
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()

            if isinstance(data, str):
                data = json.loads(data)

            result = []
            if isinstance(data, dict) and 'days' in data:
                days = data.get('days', [])
                if isinstance(days, list):
                    result.extend([day for day in days if isinstance(day, dict)])
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        try:
                            item = json.loads(item)
                        except (ValueError, TypeError):
                            continue
                    if isinstance(item, dict):
                        if 'days' in item:
                            days = item.get('days', [])
                            if isinstance(days, list):
                                result.extend([day for day in days if isinstance(day, dict)])
                        else:
                            result.append(item)
            elif isinstance(data, dict):
                if 'days' in data:
                    days = data.get('days', [])
                    if isinstance(days, list):
                        result.extend([day for day in days if isinstance(day, dict)])
                else:
                    result.append(data)

            return result
        except requests.RequestException:
            return []
        except (ValueError, TypeError, json.JSONDecodeError):
            return []

    def fetch_attendance_range(self, start_date: datetime, end_date: datetime) -> List[Dict]:
        all_data = []
        current_date = datetime(start_date.year, start_date.month, 1)
        end = datetime(end_date.year, end_date.month, 1)

        while current_date <= end:
            month_data = self.fetch_month_data(current_date.month, current_date.year)
            all_data.extend(month_data)

            if current_date.month == 12:
                current_date = datetime(current_date.year + 1, 1, 1)
            else:
                current_date = datetime(current_date.year, current_date.month + 1, 1)

        if end_date.month != end.month or end_date.year != end.year:
            month_data = self.fetch_month_data(end_date.month, end_date.year)
            all_data.extend(month_data)

        return all_data
