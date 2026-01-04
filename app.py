from flask import Flask, render_template, jsonify, Response, request
from services.attendance_api_service import AttendanceAPIService
from services.statistics_processor import StatisticsProcessor
from datetime import datetime, timedelta
import csv
import io
import os

app = Flask(__name__)
CSV_DIR = 'csv_exports'
if not os.path.exists(CSV_DIR):
    os.makedirs(CSV_DIR)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/statistics', methods=['GET', 'POST'])
def get_statistics():
    try:
        if request.method == 'POST':
            data = request.get_json() or {}
            cookie = data.get('cookie', '')
            start_month = data.get('start_month', '')
            start_year = data.get('start_year', '')
            end_month = data.get('end_month', '')
            end_year = data.get('end_year', '')
        else:
            cookie = request.args.get('cookie', '')
            start_month = request.args.get('start_month', '')
            start_year = request.args.get('start_year', '')
            end_month = request.args.get('end_month', '')
            end_year = request.args.get('end_year', '')
        
        if not cookie:
            return jsonify({'error': 'Cookie is required'}), 400
        
        if start_month and start_year and end_month and end_year:
            start_date = datetime(int(start_year), int(start_month), 1)
            end_month_date = datetime(int(end_year), int(end_month), 1)
            if end_month_date.month == 12:
                next_month = datetime(end_month_date.year + 1, 1, 1)
            else:
                next_month = datetime(end_month_date.year, end_month_date.month + 1, 1)
            last_day = (next_month - timedelta(days=1)).day
            end_date = datetime(int(end_year), int(end_month), last_day)
            accurate_start_date = start_date
            accurate_end_date = end_date
        else:
            start_date = datetime(2025, 2, 1)
            end_date = datetime(2026, 1, 31)
            accurate_start_date = datetime(2025, 2, 16)
            accurate_end_date = datetime.now()
        
        api_service = AttendanceAPIService(cookie=cookie)
        processor = StatisticsProcessor()
        
        from_backup = False
        try:
            all_data = api_service.fetch_attendance_range(start_date, end_date)
            if not all_data or len(all_data) == 0:
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
        if request.method == 'POST':
            data = request.get_json() or {}
            cookie = data.get('cookie', '')
            start_month = data.get('start_month', '')
            start_year = data.get('start_year', '')
            end_month = data.get('end_month', '')
            end_year = data.get('end_year', '')
        else:
            cookie = request.args.get('cookie', '')
            start_month = request.args.get('start_month', '')
            start_year = request.args.get('start_year', '')
            end_month = request.args.get('end_month', '')
            end_year = request.args.get('end_year', '')
        
        if not cookie:
            return jsonify({'error': 'Cookie is required'}), 400
        
        if start_month and start_year and end_month and end_year:
            start_date = datetime(int(start_year), int(start_month), 1)
            end_month_date = datetime(int(end_year), int(end_month), 1)
            if end_month_date.month == 12:
                next_month = datetime(end_month_date.year + 1, 1, 1)
            else:
                next_month = datetime(end_month_date.year, end_month_date.month + 1, 1)
            last_day = (next_month - timedelta(days=1)).day
            end_date = datetime(int(end_year), int(end_month), last_day)
        else:
            start_date = datetime(2025, 2, 1)
            end_date = datetime(2026, 1, 31)
        
        api_service = AttendanceAPIService(cookie=cookie)
        processor = StatisticsProcessor()
        
        all_data = api_service.fetch_attendance_range(start_date, end_date)
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['תאריך', 'סטטוס ראשי', 'סטטוס משני', 'נוכח'])
        
        sorted_data = sorted(all_data, key=lambda r: datetime.strptime(r.get('date', '').split('T')[0], '%Y-%m-%d') if r.get('date') else datetime.min)
        
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
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
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
                    date = datetime.strptime(date_str, '%Y-%m-%d')
                except (ValueError, AttributeError):
                    continue
                
                main_status = row.get('סטטוס ראשי', 'לא ידוע')
                secondary_status = row.get('סטטוס משני', '')
                
                record = {
                    'date': date_str + 'T00:00:00',
                    'mainStatusDeterminedName': main_status,
                    'secondaryStatusDeterminedName': secondary_status
                }
                all_data.append(record)
        
        all_data.sort(key=lambda r: datetime.strptime(r['date'].split('T')[0], '%Y-%m-%d'))
        
        return all_data
    except Exception:
        return []

def _save_csv_automatically(all_data: list, latest_date: str):
    try:
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['תאריך', 'סטטוס ראשי', 'סטטוס משני', 'נוכח', 'חריגה'])
        
        sorted_data = sorted(all_data, key=lambda r: datetime.strptime(r.get('date', '').split('T')[0], '%Y-%m-%d') if r.get('date') else datetime.min)
        
        anomalies_by_date = {}
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
            
            anomalies_by_date[date.strftime('%Y-%m-%d')] = anomaly
            
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

