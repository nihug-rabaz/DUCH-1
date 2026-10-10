from datetime import datetime
from typing import List, Dict, Any, Set, Optional

from services.attendance_api_service import AttendanceAPIService


class FutureReporter:
    """Batch future attendance reports — one InsertFutureReport per date."""

    def __init__(self, api: AttendanceAPIService):
        self.api = api

    @staticmethod
    def to_prat_date(iso_date: str) -> str:
        """YYYY-MM-DD -> DD.MM.YYYY"""
        dt = datetime.strptime(iso_date[:10], '%Y-%m-%d')
        return dt.strftime('%d.%m.%Y')

    @staticmethod
    def normalize_existing_dates(future_reports: List[Dict]) -> Set[str]:
        existing: Set[str] = set()
        for item in future_reports or []:
            if not isinstance(item, dict):
                continue
            if item.get('auth_expired'):
                continue
            for key in ('date', 'Date', 'futureReportDate', 'FutureReportDate', 'reportDate'):
                raw = item.get(key)
                if not raw:
                    continue
                text = str(raw).strip()
                try:
                    if 'T' in text:
                        text = text.split('T')[0]
                    if '.' in text and text.count('.') == 2:
                        dt = datetime.strptime(text[:10], '%d.%m.%Y')
                    else:
                        dt = datetime.strptime(text[:10], '%Y-%m-%d')
                    existing.add(dt.strftime('%Y-%m-%d'))
                    break
                except (ValueError, TypeError):
                    continue
        return existing

    def report_batch(
        self,
        dates: List[str],
        main_code: str,
        secondary_code: str,
        note: str = '',
        skip_duplicates: bool = True,
        existing_dates: Optional[Set[str]] = None
    ) -> List[Dict[str, Any]]:
        results = []
        known: Set[str] = set(existing_dates or [])

        if skip_duplicates and existing_dates is None:
            future_payload = self.api.get_future_reports()
            if future_payload.get('auth_expired'):
                for date in dates:
                    results.append({
                        'date': str(date)[:10],
                        'status': 'auth_expired',
                        'message': 'הסשן פג תוקף'
                    })
                return results
            if not future_payload.get('ok'):
                for date in dates:
                    results.append({
                        'date': str(date)[:10],
                        'status': 'rejected',
                        'message': 'לא ניתן לבדוק דיווחים קיימים — ' + (future_payload.get('error') or 'שגיאה')
                    })
                return results
            known = self.normalize_existing_dates(future_payload.get('reports') or [])

        for index, date in enumerate(dates):
            iso = str(date)[:10]
            if skip_duplicates and iso in known:
                results.append({
                    'date': iso,
                    'status': 'skipped_duplicate',
                    'message': 'כבר קיים דיווח עתידי לתאריך זה'
                })
                continue

            try:
                prat_date = self.to_prat_date(iso)
            except ValueError:
                results.append({
                    'date': iso,
                    'status': 'rejected',
                    'message': 'פורמט תאריך לא תקין'
                })
                continue

            response = self.api.insert_future_report(
                main_code=main_code,
                secondary_code=secondary_code,
                future_report_date=prat_date,
                note=note or ''
            )
            status = response.get('status', 'rejected')
            results.append({
                'date': iso,
                'status': status,
                'message': response.get('message', ''),
                'http_status': response.get('http_status')
            })
            if status == 'auth_expired':
                for remaining in dates[index + 1:]:
                    results.append({
                        'date': str(remaining)[:10],
                        'status': 'auth_expired',
                        'message': 'הסשן פג תוקף'
                    })
                break
            if status == 'success':
                known.add(iso)

        return results

    def delete_batch(self, dates: List[str]) -> List[Dict[str, Any]]:
        """Cancel future reports for ISO dates (YYYY-MM-DD) that have not occurred yet."""
        results = []
        today = datetime.now().date()
        normalized = [str(d)[:10] for d in dates]
        for index, iso in enumerate(normalized):
            try:
                dt = datetime.strptime(iso, '%Y-%m-%d').date()
            except ValueError:
                results.append({
                    'date': iso,
                    'status': 'rejected',
                    'message': 'פורמט תאריך לא תקין'
                })
                continue
            if dt < today:
                results.append({
                    'date': iso,
                    'status': 'rejected',
                    'message': 'לא ניתן לבטל דיווח שכבר עבר'
                })
                continue
            prat = dt.strftime('%d.%m.%Y')
            response = self.api.delete_future_report(prat)
            status = response.get('status', 'rejected')
            results.append({
                'date': iso,
                'status': status,
                'message': response.get('message', ''),
                'http_status': response.get('http_status')
            })
            if status == 'auth_expired':
                for remaining in normalized[index + 1:]:
                    results.append({
                        'date': remaining,
                        'status': 'auth_expired',
                        'message': 'הסשן פג תוקף'
                    })
                break
        return results
