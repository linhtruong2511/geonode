#!/usr/bin/env python3
"""
Import script cho dữ liệu OCO-2 (.nc4 / HDF5)
Sử dụng raw SQL + psycopg2 executemany để tối ưu hiệu suất bulk insert.

Cách dùng:
    python import_oco2.py <path_to_file.nc4> [options]

Options:
    --db-url        PostgreSQL DSN (default: đọc từ DATABASE_URL env)
    --satellite-id  ID của bản ghi Satellite trong DB (default: tự tạo nếu chưa có)
    --quality-only  Chỉ import soundings có xco2_quality_flag == 0
    --bbox          Giới hạn không gian: "lat_min,lon_min,lat_max,lon_max" (vd: "8,102,24,110" cho Việt Nam)
    --batch-size    Số bản ghi mỗi batch INSERT (default: 5000)
    --no-profiles   Bỏ qua import vertical profiles (nhanh hơn)
    --dry-run       Phân tích file nhưng không ghi vào DB

Ví dụ:
    python import_oco2.py oco2_LtCO2_250302.nc4
    python import_oco2.py oco2_LtCO2_250302.nc4 --bbox "8,102,24,110" --quality-only
    python import_oco2.py oco2_LtCO2_250302.nc4 --batch-size 10000 --no-profiles
"""

import argparse
import glob
import hashlib
import logging
import os
import sys
import time
from datetime import datetime, timezone

import h5py
import numpy as np
import psycopg2
import psycopg2.extras

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ─── Constants ─────────────────────────────────────────────────────────────────
DATA_SOURCE = "OCO2"
FILE_FORMAT = "NETCDF4"
SATELLITE_NAME = "OCO-2"
SATELLITE_OPERATOR = "NASA"

# OCO-2 time base: số giây tính từ 1993-01-01 00:00:00 UTC (TAI93)
TAI93_EPOCH = datetime(1993, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
TAI93_EPOCH_TS = TAI93_EPOCH.timestamp()


def parse_args():
    """Phân tích các tham số dòng lệnh"""
    p = argparse.ArgumentParser(description="Import OCO-2 .nc4 file into CO2 Management DB")
    p.add_argument("path", help="Path to .nc4 file or directory containing .nc4 files")
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"), help="PostgreSQL DSN")
    p.add_argument("--satellite-id", type=int, default=None)
    p.add_argument("--quality-only", action="store_true", help="Only import flag==0 soundings")
    p.add_argument("--bbox", default=None, help="lat_min,lon_min,lat_max,lon_max")
    p.add_argument("--batch-size", type=int, default=5000)
    p.add_argument("--no-profiles", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def get_db_url(args):
    """
    Xác định URL kết nối cơ sở dữ liệu.
    Ưu tiên: Tham số dòng lệnh -> Biến môi trường -> Cấu hình Django (nếu có).
    """
    db_url = args.db_url
    if db_url:
        if db_url.startswith("postgis://"):
            db_url = db_url.replace("postgis://", "postgresql://", 1)
        return db_url
    try:
        # Thử lấy từ cài đặt Django nếu script chạy trong môi trường Django
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "geonode_project.settings")
        import django
        django.setup()
        from django.conf import settings
        db = settings.DATABASES["default"]
        return (
            f"postgresql://{db['USER']}:{db['PASSWORD']}@{db['HOST']}:{db.get('PORT', 5432)}/{db['NAME']}"
        )
    except Exception:
        pass
    raise ValueError(
        "Cannot resolve database URL. Set --db-url or DATABASE_URL env variable."
    )


def compute_sha256(path: str) -> str:
    """Tính mã băm SHA-256 của tệp để kiểm tra trùng lặp"""
    sha = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest()


def date_array_to_datetime(date_row) -> datetime:
    """Chuyển đổi mảng ngày của OCO-2 [Y, M, D, H, Min, S, ms] thành UTC datetime."""
    try:
        y, mo, d, h, mi, s, ms = int(date_row[0]), int(date_row[1]), int(date_row[2]), \
                                   int(date_row[3]), int(date_row[4]), int(date_row[5]), int(date_row[6])
        return datetime(y, mo, d, h, mi, s, ms * 1000, tzinfo=timezone.utc)
    except Exception:
        return None


def tai93_to_datetime(seconds: float) -> datetime:
    """Chuyển đổi nhãn thời gian TAI93 của OCO-2 thành UTC datetime."""
    return datetime.fromtimestamp(TAI93_EPOCH_TS + float(seconds), tz=timezone.utc)


def get_or_create_satellite(cur, satellite_id: int | None) -> int:
    """Lấy hoặc tạo mới bản ghi vệ tinh OCO-2 trong cơ sở dữ liệu"""
    if satellite_id:
        cur.execute("SELECT id FROM co2_management_satellite WHERE id = %s", (satellite_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Satellite ID {satellite_id} not found in DB.")
        return satellite_id

    cur.execute(
        "SELECT id FROM co2_management_satellite WHERE satellite_name = %s",
        (SATELLITE_NAME,),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute(
        """INSERT INTO co2_management_satellite (satellite_name, operator, is_active)
           VALUES (%s, %s, %s) RETURNING id""",
        (SATELLITE_NAME, SATELLITE_OPERATOR, True),
    )
    sat_id = cur.fetchone()[0]
    log.info(f"Created satellite '{SATELLITE_NAME}' with id={sat_id}")
    return sat_id


def get_or_create_source(cur, sat_id: int, file_path: str, file_hash: str, n_soundings: int, measurement_date) -> int | None:
    """
    Tạo bản ghi nguồn dữ liệu (MeasurementSource).
    Trả về None nếu file đã được nhập trước đó (trùng mã băm).
    """
    cur.execute(
        "SELECT id FROM co2_management_measurementsource WHERE file_hash = %s",
        (file_hash,),
    )
    row = cur.fetchone()
    if row:

        log.warning(f"File already imported (hash match). source_id={row[0]}. Skipping.")
        return None

    file_name = os.path.basename(file_path)
    file_size_mb = round(os.path.getsize(file_path) / 1024 / 1024, 2)

    cur.execute(
        """INSERT INTO co2_management_measurementsource
           (satellite_id, file_name, file_format, file_size_mb, measurement_date,
            total_soundings, quality_checked, processing_level, algorithm_version, file_hash)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id""",
        (
            sat_id, file_name, FILE_FORMAT, file_size_mb, measurement_date,
            n_soundings, False, "LtCO2", "B11211",  file_hash
        ),
    )
    source_id = cur.fetchone()[0]
    log.info(f"Created MeasurementSource id={source_id} for '{file_name}'")
    return source_id


def load_oco2_data(f, quality_only: bool, bbox):
    """Read and filter all OCO-2 soundings from open HDF5 file."""
    log.info("Reading OCO-2 datasets from file...")

    lat = f["latitude"][:]
    lon = f["longitude"][:]
    xco2 = f["xco2"][:]
    xco2_unc = f["xco2_uncertainty"][:]
    qflag = f["xco2_quality_flag"][:]
    sounding_id = f["sounding_id"][:]
    time_arr = f["time"][:]  # TAI93 seconds
    date_arr = f["date"][:]  # Date array
    psurf = f["Retrieval/psurf"][:]  # surface pressure
    sza = f["solar_zenith_angle"][:]
    sza_sensor = f["sensor_zenith_angle"][:]
    land_frac = f["Sounding/land_fraction"][:]
    pressure_levels = f["pressure_levels"][:]   # (N, 20)
    co2_apriori = f["co2_profile_apriori"][:]    # (N, 20) - profile data
    ak = f["xco2_averaging_kernel"][:]           # (N, 20) - averaging kernel

    # ── Mask: quality filter
    mask = np.ones(len(lat), dtype=bool)
    if quality_only:
        mask &= (qflag == 0)
        log.info(f"Quality filter: {mask.sum()} / {len(lat)} soundings pass flag==0")

    # ── Mask: bounding box
    if bbox:
        lat_min, lon_min, lat_max, lon_max = bbox
        mask &= (lat >= lat_min) & (lat <= lat_max) & (lon >= lon_min) & (lon <= lon_max)
        log.info(f"BBox filter: {mask.sum()} soundings remain after spatial filter")

    # ── Mask: valid XCO2 (not NaN / fill value)
    mask &= np.isfinite(xco2) & (xco2 > 0)

    indices = np.where(mask)[0]
    log.info(f"Total soundings to import: {len(indices)} / {len(lat)}")

    return {
        "indices": indices,
        "lat": lat,
        "lon": lon,
        "xco2": xco2,
        "xco2_unc": xco2_unc,
        "qflag": qflag,
        "sounding_id": sounding_id,
        "date_arr": date_arr,
        "time_arr": time_arr,
        "psurf": psurf,
        "sza": sza,
        "sza_sensor": sza_sensor,
        "land_frac": land_frac,
        "pressure_levels": pressure_levels,
        "co2_apriori": co2_apriori,
        "ak": ak,
    }


def bulk_insert_measurements(cur, source_id: int, data: dict, batch_size: int) -> list[tuple[int, int]]:
    """Bulk insert measurements. Returns list of (original_index, db_id)."""
    indices = data["indices"]
    lat = data["lat"]
    lon = data["lon"]
    xco2 = data["xco2"]
    xco2_unc = data["xco2_unc"]
    qflag = data["qflag"]
    date_arr = data["date_arr"]
    time_arr = data["time_arr"]
    psurf = data["psurf"]
    sza = data["sza"]
    sza_sensor = data["sza_sensor"]
    land_frac = data["land_frac"]

    sql = """
        INSERT INTO co2_management_measurement
            (source_id, geom, latitude, longitude,
             xco2_ppm, xco2_uncertainty_ppm, xco2_quality_flag,
             surface_pressure_hpa, solar_zenith_angle_deg, view_zenith_angle_deg,
             land_fraction, data_source, measurement_time, deleted_at)
        VALUES
            (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s,
             %s, %s, %s,
             %s, %s, %s,
             %s, %s, %s, NULL)
        RETURNING id
    """

    id_map = []  # (original_index, db_id)
    total = len(indices)

    for batch_start in range(0, total, batch_size):
        batch_indices = indices[batch_start : batch_start + batch_size]
        rows = []
        for i in batch_indices:
            dt = date_array_to_datetime(date_arr[i])
            if dt is None:
                dt = tai93_to_datetime(time_arr[i])
            rows.append((
                source_id,
                float(lon[i]), float(lat[i]),  # ST_MakePoint(lon, lat)
                float(lat[i]), float(lon[i]),
                float(xco2[i]),
                float(xco2_unc[i]) if np.isfinite(xco2_unc[i]) else None,
                int(qflag[i]),
                float(psurf[i]) if np.isfinite(psurf[i]) else None,
                float(sza[i]) if np.isfinite(sza[i]) else None,
                float(sza_sensor[i]) if np.isfinite(sza_sensor[i]) else None,
                float(land_frac[i]) if np.isfinite(float(land_frac[i])) else None,
                DATA_SOURCE,
                dt.isoformat(),
            ))

        # Use executemany with RETURNING via mogrify trick
        args_str = b",".join(cur.mogrify(
            "(%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL)",
            row
        ) for row in rows)
        cur.execute(
            b"""INSERT INTO co2_management_measurement
                (source_id, geom, latitude, longitude,
                 xco2_ppm, xco2_uncertainty_ppm, xco2_quality_flag,
                 surface_pressure_hpa, solar_zenith_angle_deg, view_zenith_angle_deg,
                 land_fraction, data_source, measurement_time, deleted_at)
                VALUES """ + args_str + b" RETURNING id"
        )
        new_ids = [row[0] for row in cur.fetchall()]
        for orig_idx, db_id in zip(batch_indices, new_ids):
            id_map.append((int(orig_idx), db_id))

        pct = min(100, round((batch_start + len(batch_indices)) / total * 100))
        log.info(f"  Measurements: {batch_start + len(batch_indices)}/{total} ({pct}%)")

    return id_map


def bulk_insert_profiles(cur, id_map: list, data: dict, batch_size: int):
    """Bulk insert vertical profiles for each measurement."""
    pressure_levels = data["pressure_levels"]
    co2_apriori = data["co2_apriori"]
    ak = data["ak"]

    n_levels = pressure_levels.shape[1]
    log.info(f"Inserting vertical profiles ({n_levels} levels × {len(id_map)} soundings)...")

    profile_rows = []

    for orig_idx, db_id in id_map:
        for lvl in range(n_levels):
            profile_rows.append((
                db_id,
                lvl,
                float(pressure_levels[orig_idx, lvl]) if np.isfinite(pressure_levels[orig_idx, lvl]) else None,
                float(co2_apriori[orig_idx, lvl]) if np.isfinite(co2_apriori[orig_idx, lvl]) else None,
                None,  # co2_uncertainty_ppm not available in OCO-2 LtCO2
                None,  # temperature_k not available
                float(ak[orig_idx, lvl]) if np.isfinite(ak[orig_idx, lvl]) else None,
            ))

        if len(profile_rows) >= batch_size * n_levels:
            _flush_profiles(cur, profile_rows)
            log.info(f"  Profiles flushed: {len(profile_rows)} rows")
            profile_rows = []

    if profile_rows:
        _flush_profiles(cur, profile_rows)
        log.info(f"  Profiles flushed (final): {len(profile_rows)} rows")


def _flush_profiles(cur, rows: list):
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO co2_management_verticalprofile
           (measurement_id, level_index, pressure_hpa, co2_concentration_ppm,
            co2_uncertainty_ppm, temperature_k, averaging_kernel)
           VALUES %s""",
        rows,
        template="(%s, %s, %s, %s, %s, %s, %s)",
        page_size=2000,
    )


def update_source_metadata(cur, source_id: int, data: dict, n_inserted: int):
    indices = data["indices"]
    xco2 = data["xco2"]
    valid_xco2 = xco2[indices]
    valid_xco2 = valid_xco2[np.isfinite(valid_xco2)]

    cur.execute(
        "UPDATE co2_management_measurementsource SET quality_checked = TRUE, total_soundings = %s WHERE id = %s",
        (n_inserted, source_id),
    )
    if len(valid_xco2) > 0:
        # Upsert metadata
        cur.execute(
            """INSERT INTO co2_management_measurementmetadata
               (source_id, min_xco2, max_xco2, mean_xco2, coverage_stats)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (source_id) DO UPDATE SET
                   min_xco2 = EXCLUDED.min_xco2,
                   max_xco2 = EXCLUDED.max_xco2,
                   mean_xco2 = EXCLUDED.mean_xco2""",
            (
                source_id,
                round(float(np.nanmin(valid_xco2)), 4),
                round(float(np.nanmax(valid_xco2)), 4),
                round(float(np.nanmean(valid_xco2)), 4),
                None,
            ),
        )


def process_file(file_path, args, conn, cur, bbox):
    log.info(f"=== Processing File: {file_path} ===")
    if args.dry_run:
        log.info("DRY RUN mode - no DB writes")

    # ── Compute hash (quick duplicate check before reading)
    log.info("Computing SHA-256 hash...")
    file_hash = compute_sha256(file_path)
    log.info(f"Hash: {file_hash}")

    # ── Read file
    t0 = time.time()
    try:
        with h5py.File(file_path, "r") as f:
            # Get measurement date from first valid timestamp
            date_arr = f["date"][:]
            first_dt = date_array_to_datetime(date_arr[0])
            measurement_date = first_dt.date()
            log.info(f"Measurement date: {measurement_date}")

            # Load data
            data = load_oco2_data(f, args.quality_only, bbox)

            if args.dry_run:
                log.info(f"DRY RUN: would import {len(data['indices'])} soundings")
                return

            if len(data["indices"]) == 0:
                log.warning("No soundings passed the filter. Nothing to import.")
                return

            try:
                # ── Get/Create Satellite
                sat_id = get_or_create_satellite(cur, args.satellite_id)

                # ── Get/Create Source
                source_id = get_or_create_source(
                    cur, sat_id, file_path, file_hash,
                    len(data["indices"]), measurement_date
                )
                if source_id is None:
                    log.warning("Duplicate file, aborting.")
                    conn.rollback()
                    return

                # ── Bulk Insert Measurements
                log.info("Bulk inserting measurements...")
                id_map = bulk_insert_measurements(cur, source_id, data, args.batch_size)
                log.info(f"Inserted {len(id_map)} measurements.")

                # ── Bulk Insert Vertical Profiles
                if not args.no_profiles:
                    bulk_insert_profiles(cur, id_map, data, args.batch_size)

                # ── Update Source Metadata
                update_source_metadata(cur, source_id, data, len(id_map))

                conn.commit()
                elapsed = round(time.time() - t0, 1)
                log.info(f"✅ Done! Imported {len(id_map)} soundings in {elapsed}s")

            except Exception as e:
                conn.rollback()
                log.error(f"❌ Error during import: {e}")
                raise
    except Exception as e:
        log.error(f"❌ Failed to process file {file_path}: {e}")


def main():
    args = parse_args()

    if not os.path.exists(args.path):
        log.error(f"Path not found: {args.path}")
        sys.exit(1)

    bbox = None
    if args.bbox:
        bbox = [float(x) for x in args.bbox.split(",")]
        if len(bbox) != 4:
            log.error("--bbox must be 'lat_min,lon_min,lat_max,lon_max'")
            sys.exit(1)

    log.info("=== OCO-2 Import Script ===")
    
    files_to_process = []
    if os.path.isdir(args.path):
        log.info(f"Scanning directory {args.path} for .nc4 files...")
        files_to_process = glob.glob(os.path.join(args.path, '**', '*.nc4'), recursive=True)
    else:
        files_to_process = [args.path]

    if not files_to_process:
        log.warning("No .nc4 files found to process.")
        return

    log.info(f"Found {len(files_to_process)} files to process.")

    db_url = get_db_url(args)
    if not args.dry_run:
        log.info("Connecting to database...")
    
    conn = None
    cur = None
    if not args.dry_run:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cur = conn.cursor()

    try:
        for i, file_path in enumerate(files_to_process, 1):
            log.info(f"\n--- Processing file {i}/{len(files_to_process)} ---")
            process_file(file_path, args, conn, cur, bbox)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
