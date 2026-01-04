from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict

class StatisticsProcessor:
    def process_data(self, data: List[Dict], start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> Dict:
        if not data:
            return self._empty_statistics()
        
        sorted_data = sorted(data, key=lambda r: self._get_sort_date(r))
        
        status_counts = defaultdict(int)
        monthly_stats = defaultdict(lambda: defaultdict(int))
        daily_presence = []
        attendance_by_date = {}
        
        for record in sorted_data:
            if not isinstance(record, dict):
                continue
            
            date_str = self._extract_date(record)
            if not date_str:
                continue
            
            date = self._parse_date(date_str)
            if not date:
                continue
            
            date_only = date.date()
            weekday = date.weekday()
            
            is_weekend = weekday == 4 or weekday == 5
            
            if is_weekend:
                main_status = 'חופשה'
                secondary_status = 'שבת'
                status_key = 'חופשה - שבת'
            else:
                main_status = self._extract_main_status(record)
                secondary_status = self._extract_secondary_status(record)
                status_key = f"{main_status} - {secondary_status}" if secondary_status else main_status
            
            status_counts[status_key] += 1
            
            month_key = f"{date.year}-{date.month:02d}"
            monthly_stats[month_key][status_key] += 1
            
            is_present = False if is_weekend else ('נוכח' in main_status or 'נמצא' in main_status)
            attendance_by_date[date_only] = {
                'present': is_present,
                'status': status_key
            }
            
            daily_presence.append({
                'date': date.strftime('%Y-%m-%d'),
                'present': is_present,
                'status': status_key
            })
        
        daily_presence.sort(key=lambda x: x['date'])
        
        accurate_presence_rate = self._calculate_accurate_presence_rate(
            attendance_by_date, start_date, end_date
        )
        
        total_days_in_service = self._calculate_total_days_in_service(start_date, end_date)
        
        anomalies = self._detect_anomalies(attendance_by_date, start_date, end_date, sorted_data)
        
        latest_date = self._get_latest_date(sorted_data)
        
        return {
            'total_records': len(sorted_data),
            'status_distribution': dict(status_counts),
            'monthly_statistics': {k: dict(v) for k, v in monthly_stats.items()},
            'daily_presence': daily_presence,
            'presence_rate': self._calculate_presence_rate(daily_presence),
            'accurate_presence_rate': accurate_presence_rate,
            'monthly_presence_rates': self._calculate_monthly_presence_rates(monthly_stats),
            'anomalies': anomalies,
            'latest_date': latest_date.strftime('%Y-%m-%d') if latest_date else None,
            'total_days_in_service': total_days_in_service
        }
    
    def _extract_date(self, record: Dict) -> str:
        date_fields = ['date', 'Date', 'DATE', 'dateTime', 'datetime']
        for field in date_fields:
            if field in record and record[field]:
                return str(record[field])
        return ''
    
    def _extract_main_status(self, record: Dict) -> str:
        status_fields = ['mainStatusDeterminedName', 'mainStatus', 'status', 'mainStatusReported', 'reportedMainName']
        for field in status_fields:
            if field in record and record[field]:
                return str(record[field])
        return 'לא ידוע'
    
    def _extract_secondary_status(self, record: Dict) -> str:
        status_fields = ['secondaryStatusDeterminedName', 'secondaryStatus', 'secondaryStatusReported']
        for field in status_fields:
            if field in record and record[field]:
                return str(record[field])
        return ''
    
    def _get_sort_date(self, record: Dict) -> datetime:
        date_str = self._extract_date(record)
        if not date_str:
            return datetime.min
        date = self._parse_date(date_str)
        return date if date else datetime.min
    
    def _parse_date(self, date_str: str) -> datetime:
        if not date_str:
            return None
        
        date_str = str(date_str).strip()
        
        date_formats = [
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%d',
            '%d/%m/%Y',
            '%m/%d/%Y'
        ]
        
        if 'T' in date_str:
            date_str = date_str.split('T')[0]
        
        for fmt in date_formats:
            try:
                return datetime.strptime(date_str, fmt)
            except (ValueError, AttributeError):
                continue
        
        try:
            if len(date_str) >= 10:
                return datetime.strptime(date_str[:10], '%Y-%m-%d')
        except (ValueError, AttributeError):
            pass
        
        return None
    
    def _calculate_presence_rate(self, daily_presence: List[Dict]) -> float:
        if not daily_presence:
            return 0.0
        present_count = sum(1 for day in daily_presence if day['present'])
        return round((present_count / len(daily_presence)) * 100, 2)
    
    def _calculate_monthly_presence_rates(self, monthly_stats: Dict) -> Dict:
        monthly_rates = {}
        for month, statuses in monthly_stats.items():
            total = sum(statuses.values())
            present_count = sum(count for status, count in statuses.items() 
                              if 'נוכח' in status or 'נמצא' in status)
            monthly_rates[month] = round((present_count / total * 100), 2) if total > 0 else 0.0
        return monthly_rates
    
    def _calculate_accurate_presence_rate(self, attendance_by_date: Dict, start_date: Optional[datetime], end_date: Optional[datetime]) -> Dict:
        if not start_date or not end_date:
            return {'rate': 0.0, 'total_days': 0, 'present_days': 0, 'absent_days': 0, 'weekend_days': 0, 'no_data_days': 0}
        
        start = start_date.date()
        end = end_date.date()
        current = start
        total_days = 0
        present_days = 0
        absent_days = 0
        weekend_days = 0
        
        while current <= end:
            weekday = current.weekday()
            is_weekend = weekday == 4 or weekday == 5
            
            if is_weekend:
                weekend_days += 1
            else:
                total_days += 1
                if current in attendance_by_date:
                    status_info = attendance_by_date[current]
                    if isinstance(status_info, dict):
                        if status_info['present']:
                            present_days += 1
                        else:
                            absent_days += 1
                    elif status_info:
                        present_days += 1
                    else:
                        absent_days += 1
            
            current += timedelta(days=1)
        
        rate = round((present_days / total_days * 100), 2) if total_days > 0 else 0.0
        
        return {
            'rate': rate,
            'total_days': total_days,
            'present_days': present_days,
            'absent_days': absent_days,
            'weekend_days': weekend_days,
            'no_data_days': total_days - present_days - absent_days
        }
    
    def _calculate_total_days_in_service(self, start_date: Optional[datetime], end_date: Optional[datetime]) -> int:
        if not start_date or not end_date:
            return 0
        
        start = start_date.date()
        end = end_date.date()
        current = start
        total_days = 0
        
        while current <= end:
            total_days += 1
            current += timedelta(days=1)
        
        return total_days
    
    def _detect_anomalies(self, attendance_by_date: Dict, start_date: Optional[datetime], end_date: Optional[datetime], all_data: List[Dict]) -> List[Dict]:
        anomalies = []
        
        if not start_date or not end_date:
            return anomalies
        
        start = start_date.date()
        end = end_date.date()
        current = start
        
        while current <= end:
            weekday = current.weekday()
            is_weekend = weekday == 4 or weekday == 5
            
            if not is_weekend:
                if current not in attendance_by_date:
                    anomalies.append({
                        'date': current.strftime('%Y-%m-%d'),
                        'type': 'missing_data',
                        'description': 'חסר נתון ליום זה'
                    })
                else:
                    status_info = attendance_by_date[current]
                    if isinstance(status_info, dict):
                        if not status_info['present']:
                            anomalies.append({
                                'date': current.strftime('%Y-%m-%d'),
                                'type': 'absent',
                                'description': status_info.get('status', 'לא נוכח')
                            })
                    elif not status_info:
                        anomalies.append({
                            'date': current.strftime('%Y-%m-%d'),
                            'type': 'absent',
                            'description': 'לא נוכח'
                        })
            
            current += timedelta(days=1)
        
        return anomalies
    
    def _get_latest_date(self, data: List[Dict]) -> Optional[datetime]:
        latest = None
        for record in data:
            if not isinstance(record, dict):
                continue
            date_str = self._extract_date(record)
            if not date_str:
                continue
            date = self._parse_date(date_str)
            if date and (not latest or date > latest):
                latest = date
        return latest
    
    def _empty_statistics(self) -> Dict:
        return {
            'total_records': 0,
            'status_distribution': {},
            'monthly_statistics': {},
            'daily_presence': [],
            'presence_rate': 0.0,
            'accurate_presence_rate': {'rate': 0.0, 'total_days': 0, 'present_days': 0, 'absent_days': 0, 'weekend_days': 0, 'no_data_days': 0},
            'monthly_presence_rates': {},
            'anomalies': [],
            'latest_date': None,
            'total_days_in_service': 0
        }

