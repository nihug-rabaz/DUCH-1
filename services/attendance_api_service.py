import requests
import json
from datetime import datetime
from typing import List, Dict, Any

class AttendanceAPIService:
    def __init__(self, cookie: str = None):
        self.base_url = "https://one.prat.idf.il/api/Attendance/memberHistory"
        if not cookie:
            raise ValueError("Cookie is required for authentication")
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
    
    def fetch_month_data(self, month: int, year: int) -> List[Dict]:
        payload = {"month": month, "year": year}
        try:
            response = requests.post(self.base_url, headers=self.headers, json=payload)
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

