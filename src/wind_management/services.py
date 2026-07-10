import os
import numpy as np
import xarray as xr

def get_netcdf_data(file_location, bbox=None, step=1, u=None, v=None):
    """
    Reads a NetCDF file, slices it by bounding box, downsamples it by step,
    and returns a structured dictionary:
    {
        "lats": [...],
        "lons": [...],
        "u": [[...]],
        "v": [[...]],
        "u_var_name": "...",
        "v_var_name": "..."
    }
    """
    if not os.path.exists(file_location):
        raise FileNotFoundError(f"NetCDF file not found at: {file_location}")

    with xr.open_dataset(file_location) as ds:
        # Detect lat and lon coordinate names
        lon_name = 'lon'
        lat_name = 'lat'

        # Select the active data subset
        sub_ds = ds

        # Check and handle dimensions other than lat/lon (e.g. time, elevation/depth/level)
        sel_kwargs = {}
        for dim in sub_ds.dims:
            if dim not in [lat_name, lon_name]:
                # If there are multiple values, select the first slice
                if sub_ds.sizes[dim] > 0:
                    sel_kwargs[dim] = 0
        
        if sel_kwargs:
            sub_ds = sub_ds.isel(**sel_kwargs)

        # Slice by bounding box if provided (bbox: [min_lon, min_lat, max_lon, max_lat])
        if bbox:
            min_lon, min_lat, max_lon, max_lat = bbox
            # Padding the bbox by 1 unit to avoid empty borders when zooming in
            min_lon -= 1.0
            min_lat -= 1.0
            max_lon += 1.0
            max_lat += 1.0
            
            # Check coordinate ordering (ascending vs descending) to slice correctly
            lat_coords = sub_ds[lat_name].values
            if len(lat_coords) > 1 and lat_coords[0] > lat_coords[-1]:
                lat_slice = slice(max_lat, min_lat)
            else:
                lat_slice = slice(min_lat, max_lat)
                
            lon_coords = sub_ds[lon_name].values
            if len(lon_coords) > 1 and lon_coords[0] > lon_coords[-1]:
                lon_slice = slice(max_lon, min_lon)
            else:
                lon_slice = slice(min_lon, max_lon)

            sub_ds = sub_ds.sel({
                lon_name: lon_slice,
                lat_name: lat_slice
            })

        # Apply downsampling (step)
        if step > 1:
            sub_ds = sub_ds.isel({
                lon_name: slice(None, None, step),
                lat_name: slice(None, None, step)
            })

        # Extract values
        lats = sub_ds[lat_name].values.tolist()
        lons = sub_ds[lon_name].values.tolist()

        u_list = None
        if u: 
            # Convert u variable to list with NaNs replaced by None
            u_vals = sub_ds[u].values
            # Handle 2D grid
            if u_vals.ndim == 2:
                u_list = [[None if np.isnan(val) else float(val) for val in row] for row in u_vals]
            else:
                # Flatten/reshape or convert if it's 1D/3D
                u_vals = np.atleast_2d(u_vals)
                u_list = [[None if np.isnan(val) else float(val) for val in row] for row in u_vals]

        # Convert v variable if it exists
        v_list = None
        if v:
            v_vals = sub_ds[v].values
            if v_vals.ndim == 2:
                v_list = [[None if np.isnan(val) else float(val) for val in row] for row in v_vals]
            else:
                v_vals = np.atleast_2d(v_vals)
                v_list = [[None if np.isnan(val) else float(val) for val in row] for row in v_vals]

        return {
            "lats": [float(y) for y in lats],
            "lons": [float(x) for x in lons],
            "u": u_list,
            "v": v_list,
            "u_var_name": u,
            "v_var_name": v
        }
