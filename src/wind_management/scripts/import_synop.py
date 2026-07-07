import os
import sys
import django
import pandas as pd
from datetime import datetime
from django.contrib.gis.geos import Point
import pytz

# Setup django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(src_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'geonode_project.settings')
django.setup()

from wind_management.models import Dataset, Station, Observation

def clean_decimal(val):
    if pd.isna(val) or val == '' or str(val).strip() == '':
        return None
    try:
        return float(val)
    except ValueError:
        return None

def import_synop_data(csv_path):
    print(f"Reading CSV from {csv_path}...")
    df = pd.read_csv(csv_path)
    
    # 1. Create or get the Dataset
    dataset, created = Dataset.objects.get_or_create(
        code='synop_189',
        defaults={
            'name': 'SYNOP 189 Stations Data',
            'category': 'STATION',
            'description': 'Data from 189 SYNOP observation stations.',
            'source_provider': 'VNMHA',
            'temporal_resolution': 'hourly'
        }
    )
    if created:
        print(f"Created dataset: {dataset.code}")
    else:
        print(f"Using existing dataset: {dataset.code}")
        
    print("Processing rows...")
    stations_cache = {}
    observations_to_create = []
    count = 0
    
    for index, row in df.iterrows():
        try:
            # Parse station
            ma_tram = str(row['MaTram']).strip()
            ten_tram = str(row['TenTram']).strip()
            
            if ma_tram not in stations_cache:
                vido = clean_decimal(row['Vido'])
                kinhdo = clean_decimal(row['Kinhdo'])
                
                if vido is None or kinhdo is None:
                    continue # Skip invalid location
                    
                station, st_created = Station.objects.get_or_create(
                    dataset=dataset,
                    station_code=ma_tram,
                    defaults={
                        'name': ten_tram,
                        'geom': Point(kinhdo, vido, srid=4326),
                        'station_type': 'SYNOP'
                    }
                )
                stations_cache[ma_tram] = station
            
            station = stations_cache[ma_tram]
            
            # Parse observation
            obs_str = str(row['Obs']).strip()
            if len(obs_str) == 10: # YYYYMMDDHH
                obs_time = datetime.strptime(obs_str, '%Y%m%d%H')
                obs_time = pytz.utc.localize(obs_time)
            else:
                continue # Skip invalid time
                
            obs = Observation(
                station=station,
                obs_time=obs_time,
                rain_06h=clean_decimal(row.get('Mua06h(mm)')),
                rain_24h=clean_decimal(row.get('Mua24h(mm)')),
                temp_2m=clean_decimal(row.get('T2m(oC)')),
                temp_min=clean_decimal(row.get('Tmin(oC)')),
                temp_max=clean_decimal(row.get('Tmax(oC)')),
                humidity=clean_decimal(row.get('DoAm(%)')),
                pressure=clean_decimal(row.get('Ps(hPa)')),
                wind_dir=clean_decimal(row.get('HuongGio')),
                wind_speed=clean_decimal(row.get('TocDo(m/s)'))
            )
            observations_to_create.append(obs)
            count += 1
            
            # Batch insert to avoid huge memory usage
            if len(observations_to_create) >= 5000:
                # Use ignore_conflicts for partitioned table (PostgreSQL 10+ supports DO NOTHING, but partitioned tables have some limitations, we'll try)
                Observation.objects.bulk_create(observations_to_create, ignore_conflicts=True)
                print(f"Inserted {count} records...")
                observations_to_create = []
                
        except Exception as e:
            print(f"Error processing row {index}: {e}")
            continue

    if observations_to_create:
        Observation.objects.bulk_create(observations_to_create, ignore_conflicts=True)
        print(f"Inserted {count} records...")
        
    print(f"Import completed! Total records processed: {count}")

if __name__ == "__main__":
    CSV_PATH = os.environ.get('SYNOP_CSV_PATH', '/data/winds/synop_data_2026.csv')
    if os.path.exists(CSV_PATH):
        import_synop_data(CSV_PATH)
    else:
        print(f"File not found: {CSV_PATH}")
