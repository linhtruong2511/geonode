import os
import sys
import glob
import django
from datetime import datetime
from django.contrib.gis.geos import Polygon
import pytz

# Setup django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(src_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'geonode_project.settings')
django.setup()

from wind_management.models import Dataset, RasterGranuleIndex

def import_metadata(base_dir, dataset, filename_prefix='', time_format='%Y%m%d%H', bbox=(105.0, 17.0, 110.0, 21.0)):
    print(f"Scanning NetCDF files in {base_dir} for dataset {dataset.code}...")
    nc_files = glob.glob(os.path.join(base_dir, '**', '*.nc'), recursive=True)
    
    if not nc_files:
        print(f"No .nc files found in {base_dir}.")
        return
        
    count = 0
    granules = []
    footprint = Polygon.from_bbox(bbox)
    
    for fp in nc_files:
        filename = os.path.basename(fp)
        name, ext = os.path.splitext(filename)
        
        # Remove suffix if any
        if '_cf_compliant' in name:
            name = name.replace('_cf_compliant', '')
            
        # Remove prefix if any
        if filename_prefix and name.startswith(filename_prefix):
            name = name[len(filename_prefix):]
            
        try:
            granule_time = datetime.strptime(name, time_format)
            granule_time = pytz.utc.localize(granule_time)
            
            # Save relative path so the system can find it later based on mount points
            rel_path = os.path.relpath(fp, start='/data/winds/')
            
            granules.append(RasterGranuleIndex(
                dataset=dataset,
                file_location=rel_path,
                granule_time=granule_time,
                footprint=footprint,
                variable_code='multiple'
            ))
            count += 1
            
            if len(granules) >= 2000:
                RasterGranuleIndex.objects.bulk_create(granules, ignore_conflicts=True)
                print(f"Inserted {count} granules for {dataset.code}...")
                granules = []
                
        except ValueError:
            # Filename doesn't match expected pattern
            continue

    if granules:
        RasterGranuleIndex.objects.bulk_create(granules, ignore_conflicts=True)
        print(f"Inserted {count} granules for {dataset.code}...")
        
    print(f"Completed {dataset.code}! Total granules: {count}")

def main():
    # 1. WRF 3km
    wrf_dataset, _ = Dataset.objects.get_or_create(
        code='wrf3km',
        defaults={
            'name': 'WRF 3km Regional Model',
            'category': 'GRIDDED',
            'description': 'High resolution weather model for Vietnam and East Sea.',
            'source_provider': 'VNMHA',
            'temporal_resolution': 'hourly',
            'spatial_extent': Polygon.from_bbox((105.0, 17.0, 110.0, 21.0))
        }
    )
    wrf_dir = os.environ.get('WRF_DATA_DIR', '/data/winds/wrf3km_cut')
    if os.path.exists(wrf_dir):
        import_metadata(wrf_dir, wrf_dataset, filename_prefix='', bbox=(105.0, 17.0, 110.0, 21.0))
        
    # 2. ERA5
    era5_dataset, _ = Dataset.objects.get_or_create(
        code='era5',
        defaults={
            'name': 'ERA5 Reanalysis',
            'category': 'GRIDDED',
            'description': 'ECMWF Global Reanalysis Data (Flipped).',
            'source_provider': 'Copernicus',
            'temporal_resolution': '6-hourly',
            # ERA5 is global, bbox -180 to 180, -90 to 90
            'spatial_extent': Polygon.from_bbox((-180.0, -90.0, 180.0, 90.0))
        }
    )
    era5_dir = os.environ.get('ERA5_DATA_DIR', '/data/winds/era5flip')
    if os.path.exists(era5_dir):
        import_metadata(era5_dir, era5_dataset, filename_prefix='era_wind_', bbox=(-180.0, -90.0, 180.0, 90.0))

if __name__ == "__main__":
    main()
