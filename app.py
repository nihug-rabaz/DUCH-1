from flask import Flask, render_template, jsonify, Response, request, redirect, url_for
from services.attendance_api_service import AttendanceAPIService
from services.statistics_processor import StatisticsProcessor
from services.future_reporter import FutureReporter
from services.prat_auth_service import PratAuthService
from services.ms_oauth_service import MsOAuthService
from datetime import datetime, timedelta
import csv
import io
import os

app = Flask(__name__)
CSV_DIR = 'csv_exports'
if not os.path.exists(CSV_DIR):
    os.makedirs(CSV_DIR)


def _cookie_from_request():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        return (data.get('cookie') or '').strip(), data
    return (request.args.get('cookie') or '').strip(), {}


def _parse_range(data, args_fallback=True):
    if request.method == 'POST':
        start_month = data.get('start_month', '')
        start_year = data.get('start_year', '')
        end_month = data.get('end_month', '')
        end_year = data.get('end_year', '')
    else:
        start_month = request.args.get('start_month', '') if args_fallback else ''
        start_year = request.args.get('start_year', '') if args_fallback else ''
        end_month = request.args.get('end_month', '') if args_fallback else ''
        end_year = request.args.get('end_year', '') if args_fallback else ''

    if start_month and start_year and end_month and end_year:
        start_date = datetime(int(start_year), int(start_month), 1)
        end_month_date = datetime(int(end_year), int(end_month), 1)
        if end_month_date.month == 12:
            next_month = datetime(end_month_date.year + 1, 1, 1)
        else:
            next_month = datetime(end_month_date.year, end_month_date.month + 1, 1)
        last_day = (next_month - timedelta(days=1)).day
        end_date = datetime(int(end_year), int(end_month), last_day)
        return start_date, end_date, start_date, end_date

    start_date = datetime(2025, 2, 1)
    end_date = datetime(2026, 1, 31)
    return start_date, end_date, datetime(2025, 2, 16), datetime.now()


@app.route('/')
def index():
    return redirect(url_for('home'))


@app.route('/login')
def login():
    return render_template('login.html')


@app.route('/home')
def home():
    return render_template('home.html')


@app.route('/report')
def report():
    return render_template('report.html')


@app.route('/future')
def future():
    return render_template('future.html')


@app.route('/stats')
def stats():
    return render_template('stats.html')


@app.route('/api/session/validate', methods=['POST'])
def validate_session():
    cookie, _ = _cookie_from_request()
    if not cookie:
        return jsonify({'error': 'Cookie is required', 'auth_expired': True}), 400
    try:
        api = AttendanceAPIService(cookie=cookie)
        ok, payload = api.validate_session()
        if not ok:
            status = 401 if payload.get('auth_expired') else 400
            return jsonify(payload), status
        return jsonify({'ok': True, **payload})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/auth-url', methods=['POST'])
def session_auth_url():
    """HOGER-style: start Microsoft PKCE login for one.prat."""
    data = request.get_json(silent=True) or {}
    id_number = (data.get('id_number') or data.get('idNumber') or '').strip()
    if not id_number:
        return jsonify({'error': 'id_number_required'}), 400
    try:
        verifier = MsOAuthService.generate_verifier()
        payload = MsOAuthService.build_auth_url(id_number, verifier)
        return jsonify(payload)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/complete-oauth', methods=['POST'])
def session_complete_oauth():
    """
    HOGER paste-URL flow:
      pasted https://one.prat.idf.il/#code=...
      + code_verifier from auth-url step
      → MS tokens → account/login → AppCookie
    """
    data = request.get_json(silent=True) or {}
    pasted_url = (data.get('pasted_url') or data.get('redirect_url') or '').strip()
    code_verifier = (data.get('code_verifier') or data.get('codeVerifier') or '').strip()
    bootstrap = (data.get('bootstrap_cookie') or '').strip()
    if not pasted_url or not code_verifier:
        return jsonify({'error': 'pasted_url and code_verifier are required'}), 400
    try:
        parsed = MsOAuthService.parse_redirect_url(pasted_url)
        tokens = MsOAuthService.exchange_code(parsed['code'], code_verifier)
        ms_jwt = MsOAuthService.jwt_for_prat_login(tokens)
        if not ms_jwt:
            return jsonify({'error': 'token_exchange:no_tokens'}), 401

        result = PratAuthService.login_with_ms_token(ms_jwt, bootstrap_cookie=bootstrap)
        if not result.get('ok') or not result.get('cookie'):
            return jsonify({
                'error': result.get('error') or 'account/login נכשל אחרי OAuth',
                'http_status': result.get('http_status'),
            }), 401

        api = AttendanceAPIService(cookie=result['cookie'])
        ok, payload = api.validate_session()
        if not ok:
            return jsonify({
                'error': payload.get('error') or 'הסשן שנוצר לא תקף',
                'auth_expired': payload.get('auth_expired', False),
            }), 401

        return jsonify({
            'ok': True,
            'cookie': result['cookie'],
            'user_name': payload.get('user_name') or result.get('user_name') or '',
            'has_app_cookie': result.get('has_app_cookie', False),
            'auth_mode': 'oauth-paste-url',
        })
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/ms-login', methods=['POST'])
def ms_login():
    """
    Advanced fallback: paste Microsoft JWT directly → AppCookie.
    Prefer /api/session/complete-oauth (paste URL) like HOGER.
    """
    data = request.get_json(silent=True) or {}
    ms_token = (data.get('ms_token') or data.get('authorization') or '').strip()
    bootstrap = (data.get('bootstrap_cookie') or data.get('cookie') or '').strip()
    if not ms_token:
        return jsonify({'error': 'ms_token is required'}), 400
    try:
        result = PratAuthService.login_with_ms_token(ms_token, bootstrap_cookie=bootstrap)
        if not result.get('ok') or not result.get('cookie'):
            return jsonify({
                'error': result.get('error') or 'התחברות נכשלה',
                'http_status': result.get('http_status'),
            }), 401

        api = AttendanceAPIService(cookie=result['cookie'])
        ok, payload = api.validate_session()
        if not ok:
            return jsonify({
                'error': payload.get('error') or 'הסשן שנוצר לא תקף מול Attendance',
                'auth_expired': payload.get('auth_expired', False),
            }), 401

        return jsonify({
            'ok': True,
            'cookie': result['cookie'],
            'user_name': payload.get('user_name') or result.get('user_name') or '',
            'has_app_cookie': result.get('has_app_cookie', False),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statuses', methods=['POST'])
def api_statuses():
    cookie, _ = _cookie_from_request()
    if not cookie:
        return jsonify({'error': 'Cookie is required'}), 400
    try:
        api = AttendanceAPIService(cookie=cookie)
        status_code, data = api.get_filter_statuses(raw=True)
        if status_code in (401, 403):
            return jsonify({'error': 'הסשן פג תוקף', 'auth_expired': True}), 401
        if status_code >= 400 or not data:
            return jsonify({'error': 'לא ניתן לטעון סוגי דיווח'}), 502
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/home/summary', methods=['POST'])
def home_summary():
    cookie, _ = _cookie_from_request()
    if not cookie:
        return jsonify({'error': 'Cookie is required'}), 400
    try:
        api = AttendanceAPIService(cookie=cookie)
        reported = api.get_reported_data()
        if reported.get('auth_expired'):
            return jsonify({'error': 'הסשן פג תוקף', 'auth_expired': True}), 401
        future_payload = api.get_future_reports(months_ahead=3)
        if future_payload.get('auth_expired'):
            return jsonify({'error': 'הסשן פג תוקף', 'auth_expired': True}), 401
        if not future_payload.get('ok'):
            return jsonify({
                'error': future_payload.get('error') or 'לא ניתן לטעון דיווחים עתידיים',
                'ok': False
            }), 502
        future = future_payload.get('reports') or []
        ok, session_info = api.validate_session()
        return jsonify({
            'ok': ok,
            'user_name': session_info.get('user_name', ''),
            'reported': reported,
            'future_count': len(future),
            'future_reports': future,
            'future_ok': True,
            'future_window': {
                'minDate': future_payload.get('minDate'),
                'maxDate': future_payload.get('maxDate'),
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/future/list', methods=['POST'])
def future_list():
    cookie, data = _cookie_from_request()
    if not cookie:
        return jsonify({'error': 'Cookie is required'}), 400
    months_ahead = int(data.get('months_ahead') or 3)
    try:
        api = AttendanceAPIService(cookie=cookie)
        payload = api.get_future_reports(months_ahead=months_ahead)
        if payload.get('auth_expired'):
            return jsonify({'error': 'הסשן פג תוקף', 'auth_expired': True}), 401
        if not payload.get('ok'):
            return jsonify({'error': payload.get('error') or 'שגיאה בטעינה'}), 502
        return jsonify({
            'reports': payload.get('reports') or [],
            'count': len(payload.get('reports') or []),
            'minDate': payload.get('minDate'),
            'maxDate': payload.get('maxDate'),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/report/delete-bulk', methods=['POST'])
def report_delete_bulk():
    cookie, data = _cookie_from_request()
    if not cookie:
        return jsonify({'error': 'Cookie is required'}), 400
    dates = data.get('dates') or []
    if not dates:
        return jsonify({'error': 'נא לבחור לפחות תאריך אחד לביטול'}), 400
    if len(dates) > 31:
        return jsonify({'error': 'ניתן לבטל עד 31 תאריכים בבקשה אחת'}), 400
    try:
        api = AttendanceAPIService(cookie=cookie)
        reporter = FutureReporter(api)
        results = reporter.delete_batch(dates)
        auth_expired = any(r.get('status') == 'auth_expired' for r in results)
        payload = {
            'results': results,
            'success_count': sum(1 for r in results if r.get('status') == 'success'),
            'rejected_count': sum(1 for r in results if r.get('status') == 'rejected'),
            'auth_expired': auth_expired
        }
        return jsonify(payload), (401 if auth_expired and payload['success_count'] == 0 else 200)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/report/bulk', methods=['POST'])
def report_bulk():
    cookie, data = _cookie_from_request()
    if not cookie:
        return jsonify({'error': 'Cookie is required'}), 400

    dates = data.get('dates') or []
    main_code = str(data.get('main_code') or '').strip()
    secondary_code = str(data.get('secondary_code') or '').strip()
    note = data.get('note') or ''
    skip_duplicates = data.get('skip_duplicates', True)

    if not dates:
        return jsonify({'error': 'נא לבחור לפחות תאריך אחד'}), 400
    if len(dates) > 31:
        return jsonify({'error': 'ניתן לדווח עד 31 תאריכים בבקשה אחת'}), 400
    if not main_code or not secondary_code:
        return jsonify({'error': 'נא לבחור סוג דיווח ראשי ומשני'}), 400

    try:
        api = AttendanceAPIService(cookie=cookie)
        reporter = FutureReporter(api)
        results = reporter.report_batch(
            dates=dates,
            main_code=main_code,
            secondary_code=secondary_code,
            note=note,
            skip_duplicates=bool(skip_duplicates)
        )
        auth_expired = any(r.get('status') == 'auth_expired' for r in results)
        payload = {
            'results': results,
            'success_count': sum(1 for r in results if r.get('status') == 'success'),
            'rejected_count': sum(1 for r in results if r.get('status') == 'rejected'),
            'skipped_count': sum(1 for r in results if r.get('status') == 'skipped_duplicate'),
            'auth_expired': auth_expired
        }
        return jsonify(payload), (401 if auth_expired and payload['success_count'] == 0 else 200)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics', methods=['GET', 'POST'])
def get_statistics():
    try:
        cookie, data = _cookie_from_request()
        if not cookie:
            return jsonify({'error': 'Cookie is required'}), 400

        start_date, end_date, accurate_start_date, accurate_end_date = _parse_range(data)

        api_service = AttendanceAPIService(cookie=cookie)
        processor = StatisticsProcessor()

        from_backup = False
        try:
            probe_status, _ = api_service.get_filter_statuses(raw=True)
            if probe_status in (401, 403):
                return jsonify({'error': 'הסשן פג תוקף', 'auth_expired': True}), 401
            all_data = api_service.fetch_attendance_range(start_date, end_date)
            if not all_data:
                raise Exception("No data from API")
        except Exception:
            all_data = _load_from_csv()
            from_backup = True
            if not all_data:
                return jsonify({'error': 'לא ניתן לטעון נתונים מה-API או מהקובץ הגיבוי'}), 500

        statistics = processor.process_data(all_data, accurate_start_date, accurate_end_date)

        if statistics.get('latest_date') and all_data and not from_backup:
            try:
                _save_csv_automatically(all_data, statistics['latest_date'])
            except Exception:
                pass

        statistics['from_backup'] = from_backup
        return jsonify(statistics)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export/csv', methods=['GET', 'POST'])
def export_csv():
    try:
        cookie, data = _cookie_from_request()
        if not cookie:
            return jsonify({'error': 'Cookie is required'}), 400

        start_date, end_date, _, _ = _parse_range(data)
        api_service = AttendanceAPIService(cookie=cookie)
        all_data = api_service.fetch_attendance_range(start_date, end_date)

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['תאריך', 'סטטוס ראשי', 'סטטוס משני', 'נוכח'])

        sorted_data = sorted(
            all_data,
            key=lambda r: datetime.strptime(r.get('date', '').split('T')[0], '%Y-%m-%d')
            if r.get('date') else datetime.min
        )

        for record in sorted_data:
            if not isinstance(record, dict):
                continue
            date_str = record.get('date', '')
            if not date_str:
                continue
            try:
                if 'T' in str(date_str):
                    date_str = str(date_str).split('T')[0]
                date = datetime.strptime(date_str[:10], '%Y-%m-%d')
            except (ValueError, AttributeError):
                continue

            weekday = date.weekday()
            is_weekend = weekday == 4 or weekday == 5
            if is_weekend:
                main_status = 'חופשה'
                secondary_status = 'שבת'
                is_present = False
            else:
                main_status = record.get('mainStatusDeterminedName', record.get('mainStatusReported', 'לא ידוע'))
                secondary_status = record.get('secondaryStatusDeterminedName', record.get('secondaryStatusReported', ''))
                is_present = 'נוכח' in main_status or 'נמצא' in main_status

            writer.writerow([
                date.strftime('%Y-%m-%d'),
                main_status,
                secondary_status,
                'כן' if is_present else 'לא'
            ])

        output.seek(0)
        filename = f'attendance_data_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        return Response(
            output.getvalue(),
            mimetype='text/csv; charset=utf-8-sig',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _load_from_csv() -> list:
    try:
        if not os.path.exists(CSV_DIR):
            return []
        csv_files = [f for f in os.listdir(CSV_DIR) if f.startswith('attendance_') and f.endswith('.csv')]
        if not csv_files:
            return []
        csv_files.sort(reverse=True)
        latest_file = os.path.join(CSV_DIR, csv_files[0])
        all_data = []
        with open(latest_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                date_str = row.get('תאריך', '')
                if not date_str:
                    continue
                try:
                    datetime.strptime(date_str, '%Y-%m-%d')
                except (ValueError, AttributeError):
                    continue
                all_data.append({
                    'date': date_str + 'T00:00:00',
                    'mainStatusDeterminedName': row.get('סטטוס ראשי', 'לא ידוע'),
                    'secondaryStatusDeterminedName': row.get('סטטוס משני', '')
                })
        all_data.sort(key=lambda r: datetime.strptime(r['date'].split('T')[0], '%Y-%m-%d'))
        return all_data
    except Exception:
        return []


def _save_csv_automatically(all_data: list, latest_date: str):
    try:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['תאריך', 'סטטוס ראשי', 'סטטוס משני', 'נוכח', 'חריגה'])
        sorted_data = sorted(
            all_data,
            key=lambda r: datetime.strptime(r.get('date', '').split('T')[0], '%Y-%m-%d')
            if r.get('date') else datetime.min
        )
        for record in sorted_data:
            if not isinstance(record, dict):
                continue
            date_str = record.get('date', '')
            if not date_str:
                continue
            try:
                if 'T' in str(date_str):
                    date_str = str(date_str).split('T')[0]
                date = datetime.strptime(date_str[:10], '%Y-%m-%d')
            except (ValueError, AttributeError):
                continue
            weekday = date.weekday()
            is_weekend = weekday == 4 or weekday == 5
            if is_weekend:
                main_status = 'חופשה'
                secondary_status = 'שבת'
                is_present = False
                anomaly = 'שבת'
            else:
                main_status = record.get('mainStatusDeterminedName', record.get('mainStatusReported', 'לא ידוע'))
                secondary_status = record.get('secondaryStatusDeterminedName', record.get('secondaryStatusReported', ''))
                is_present = 'נוכח' in main_status or 'נמצא' in main_status
                anomaly = 'לא נוכח' if not is_present else ''
            writer.writerow([
                date.strftime('%Y-%m-%d'),
                main_status,
                secondary_status,
                'כן' if is_present else 'לא',
                anomaly
            ])
        filename = os.path.join(CSV_DIR, f'attendance_{latest_date}.csv')
        with open(filename, 'w', encoding='utf-8-sig', newline='') as f:
            f.write(output.getvalue())
    except Exception:
        pass


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
