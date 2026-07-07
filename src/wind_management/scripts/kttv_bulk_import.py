import os
import sys
import glob
import re
import csv
import django
from datetime import datetime
from multiprocessing import Pool, cpu_count
from django.contrib.gis.geos import Point
import pytz

# Setup django
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(src_dir)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'geonode_project.settings')
django.setup()

from wind_management.models import Dataset, Station
from django.db import connection

def clean_decimal(val):
    val = val.strip()
    if val == '' or 'x' in val.lower():
        return ''
    try:
        return str(float(val))
    except ValueError:
        return ''

def parse_txt_file(filepath):
    """
    Parses a single .txt file and returns a list of dictionaries.
    """
    records = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return records

    for line in lines[3:]:
        line = line.strip('\n')
        if not line.strip():
            continue
            
        obs = line[0:15].strip()
        tentram = line[15:27].strip()
        matram = line[27:39].strip()
        
        if len(tentram) > 0 and matram == "" and tentram[-1].isdigit():
            match = re.match(r"(.*?)(\d[/\d]*)$", tentram)
            if match:
                tentram = match.group(1).strip()
                matram = match.group(2).strip()
                
        if not matram or len(obs) < 10:
            continue
            
        vido = clean_decimal(line[39:49])
        kinhdo = clean_decimal(line[49:59])
        
        # Parse time
        try:
            obs_dt = datetime.strptime(obs[:10], '%Y%m%d%H')
            obs_time = pytz.utc.localize(obs_dt).strftime('%Y-%m-%d %H:%M:%S%z')
        except ValueError:
            continue
            
        # Parse measures
        rain_06h = clean_decimal(line[59:71])
        rain_24h = clean_decimal(line[71:83])
        temp_2m = clean_decimal(line[83:95])
        humidity = clean_decimal(line[95:107])
        pressure = clean_decimal(line[107:118])
        wind_dir = clean_decimal(line[118:133])
        wind_speed = clean_decimal(line[133:145])
        temp_min = clean_decimal(line[145:157])
        temp_max = clean_decimal(line[157:169])

        records.append({
            'matram': matram,
            'tentram': tentram,
            'vido': vido,
            'kinhdo': kinhdo,
            'obs_time': obs_time,
            'rain_06h': rain_06h,
            'rain_24h': rain_24h,
            'temp_2m': temp_2m,
            'temp_min': temp_min,
            'temp_max': temp_max,
            'humidity': humidity,
            'pressure': pressure,
            'wind_dir': wind_dir,
            'wind_speed': wind_speed
        })
        
    return records

def process_year_dir(args):
    """
    Reads all txt files in a year directory, maps to station_ids, writes CSV.
    """
    year_dir, dataset_id, station_map_dict, output_csv = args
    txt_files = glob.glob(os.path.join(year_dir, '**', '*.txt'), recursive=True)
    if not txt_files:
        return 0, None
        
    total_written = 0
    with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        # Column order matching Postgres COPY command later
        for txt in txt_files:
            records = parse_txt_file(txt)
            for r in records:
                station_id = station_map_dict.get(r['matram'])
                if station_id:
                    writer.writerow([
                        station_id, r['obs_time'],
                        r['rain_06h'], r['rain_24h'], r['temp_2m'], r['temp_min'], r['temp_max'],
                        r['humidity'], r['pressure'], r['wind_dir'], r['wind_speed']
                    ])
                    total_written += 1
                    
    return total_written, output_csv

def main():
    base_dir = os.environ.get('KTTV_DATA_DIR', '/data/winds/kttv_station_observation/synop')
    temp_dir = '/data/winds/temp_csv'
    os.makedirs(temp_dir, exist_ok=True)
    
    print("1. Creating Dataset Metadata...")
    dataset, _ = Dataset.objects.get_or_create(
        code='kttv_synop',
        defaults={
            'name': 'KTTV Synop Historical Data',
            'category': 'STATION',
            'description': 'Historical data from National Meteorological and Hydrological Network.',
            'source_provider': 'VNMHA',
            'temporal_resolution': '3-hourly'
        }
    )
    
    print("2. Pre-scanning unique stations (Requires reading a subset of files to find all stations)...")
    # For speed, we just read the first few text files to get the ~172 stations
    # Wait, stations might change over 20 years. We should scan at least a file from every year.
    sample_files = []
    year_dirs = [d for d in glob.glob(os.path.join(base_dir, '*')) if os.path.isdir(d)]
    for y_dir in year_dirs:
        txts = glob.glob(os.path.join(y_dir, '**', '*.txt'), recursive=True)
        if txts:
            sample_files.append(txts[0]) # take 1 file per year to gather station metadata
            
    stations_info = {}
    for fp in sample_files:
        recs = parse_txt_file(fp)
        for r in recs:
            if r['matram'] not in stations_info and r['vido'] and r['kinhdo']:
                stations_info[r['matram']] = r

    # Insert into database
    station_map = {}
    for st in stations_info.values():
        station, _ = Station.objects.get_or_create(
            dataset=dataset,
            station_code=st['matram'],
            defaults={
                'name': st['tentram'],
                'geom': Point(float(st['kinhdo']), float(st['vido']), srid=4326),
                'station_type': 'SYNOP'
            }
        )
        station_map[st['matram']] = station.id
        
    print(f"Total distinct stations initialized: {len(station_map)}")
    
    print("3. Processing Years via Multiprocessing...")
    pool_args = []
    for y_dir in year_dirs:
        year = os.path.basename(y_dir)
        out_csv = os.path.join(temp_dir, f"kttv_{year}.csv")
        pool_args.append((y_dir, dataset.id, station_map, out_csv))
        
    with Pool(processes=min(cpu_count(), 4)) as pool:
        results = pool.map(process_year_dir, pool_args)
        
    print("4. Executing Bulk COPY into PostgreSQL...")
    total_records = 0
    with connection.cursor() as cursor:
        for written, out_csv in results:
            if written > 0 and out_csv:
                print(f"COPYing {written} records from {out_csv}...")
                with open(out_csv, 'r') as f:
                    cursor.copy_from(
                        f,
                        'wind_observations',
                        sep=',',
                        null='',
                        columns=('station_id', 'obs_time', 'rain_06h', 'rain_24h', 'temp_2m', 'temp_min', 'temp_max', 'humidity', 'pressure', 'wind_dir', 'wind_speed')
                    )
                total_records += written
                # Cleanup CSV after successful copy
                os.remove(out_csv)
                
    print(f"DONE! Successfully inserted {total_records} records.")

if __name__ == "__main__":
    main()
