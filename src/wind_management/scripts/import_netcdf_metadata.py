import os
import sys
import glob
import django
from datetime import datetime
from django.contrib.gis.geos import Polygon
import pytz
import xarray as xr

# Setup django environment
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.dirname(os.path.dirname(current_dir))
sys.path.append(src_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'geonode_project.settings')
django.setup()

from wind_management.models import Dataset, RasterGranuleIndex

def extract_footprint(fp):
    try:
        with xr.open_dataset(fp) as ds:
            if 'longitude' in ds.coords and 'latitude' in ds.coords:
                lon_var = 'longitude'
                lat_var = 'latitude'
            elif 'lon' in ds.coords and 'lat' in ds.coords:
                lon_var = 'lon'
                lat_var = 'lat'
            else:
                return None
                
            min_lon = float(ds[lon_var].min())
            max_lon = float(ds[lon_var].max())
            min_lat = float(ds[lat_var].min())
            max_lat = float(ds[lat_var].max())
            
            return Polygon.from_bbox((min_lon, min_lat, max_lon, max_lat))
    except Exception as e:
        print(f"\nError reading footprint from {fp}: {e}")
        return None

def import_metadata(base_dir, dataset, filename_prefix='', time_format='%Y%m%d%H'):
    print(f"Scanning NetCDF files in {base_dir} for dataset {dataset.code}...")
    nc_files = glob.glob(os.path.join(base_dir, '**', '*.nc'), recursive=True)
    
    if not nc_files:
        print(f"No .nc files found in {base_dir}.")
        return
        
    total_files = len(nc_files)
    print(f"Found {total_files} .nc files to process.")
    
    count = 0
    granules = []
    
    for i, fp in enumerate(nc_files):
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
            
            # Extract footprint using xarray
            footprint = extract_footprint(fp)
            if footprint is None:
                print(f"\nSkipping {fp}: could not determine footprint.")
                continue
            
            # Full path is kept as required (e.g. /data/winds/era5flip/...)
            file_location = fp.replace('\\', '/')
            
            granules.append(RasterGranuleIndex(
                dataset=dataset,
                file_location=file_location,
                granule_time=granule_time,
                footprint=footprint,
                variable_code='multiple'
            ))
            count += 1
            
            if len(granules) >= 2000:
                RasterGranuleIndex.objects.bulk_create(granules, ignore_conflicts=True)
                granules = []
                
        except ValueError:
            # Filename doesn't match expected pattern
            continue
            
        # Print progress
        sys.stdout.write(f"\rProgress: {i+1}/{total_files} files processed ({(i+1)/total_files*100:.2f}%)")
        sys.stdout.flush()

    print() # newline after progress bar
    if granules:
        RasterGranuleIndex.objects.bulk_create(granules, ignore_conflicts=True)
        
    print(f"Completed {dataset.code}! Total granules inserted/processed: {count}/{total_files}")

def main():
    # ERA5
    era5_dataset, _ = Dataset.objects.get_or_create(
        code='era5',
        defaults={
            'name': 'ERA5 Reanalysis',
            'category': 'GRIDDED',
            'description': 'ECMWF Global Reanalysis Data (Flipped).',
            'source_provider': 'Copernicus',
            'temporal_resolution': '6-hourly',
            # Set spatial extent to Gulf of Tonkin (Vịnh Bắc Bộ)
            'spatial_extent': Polygon.from_bbox((105.0, 17.0, 110.0, 21.0))
        }
    )
    
    # Use environment variable or default to Docker container path for era5flip
    era5_dir = os.environ.get('ERA5_DATA_DIR', '/data/winds/era5flip')
    if os.path.exists(era5_dir):
        import_metadata(era5_dir, era5_dataset, filename_prefix='era_wind_', time_format='%Y%m%d%H')
    else:
        print(f"Directory {era5_dir} does not exist.")

if __name__ == "__main__":
    main()
