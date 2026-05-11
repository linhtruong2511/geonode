#!/usr/bin/env python3
"""
Import script cho dữ liệu GOSAT-2 FTS SWIR L2 (.h5)
Sử dụng raw SQL + psycopg2 executemany để tối ưu hiệu suất bulk insert.

Cách dùng:
    python import_gosat2.py <path_to_file.h5> [options]

Options:
    --db-url        PostgreSQL DSN (default: đọc từ DATABASE_URL env)
    --satellite-id  ID của bản ghi Satellite trong DB (default: tự tạo nếu chưa có)
    --quality-only  Chỉ import soundings có xco2_quality_flag == 0
    --bbox          Giới hạn không gian: "lat_min,lon_min,lat_max,lon_max" (vd: "8,102,24,110" cho Việt Nam)
    --batch-size    Số bản ghi mỗi batch INSERT (default: 2000)
    --no-profiles   Bỏ qua import vertical profiles (nhanh hơn)
    --dry-run       Phân tích file nhưng không ghi vào DB

Cấu trúc file GOSAT-2 TFTS Level2 (.h5):
    SoundingGeometry/latitude         - lat float32
    SoundingGeometry/longitude        - lon float32
    SoundingAttribute/observationTime - ISO timestamp string
    SoundingAttribute/soundingUniqueID- unique sounding ID
    RetrievalResult/xco2              - XCO2 (ppm) float32
    RetrievalResult/xco2_uncert       - uncertainty float32
    RetrievalResult/xco2_quality_flag - 0=good, 1=bad
    RetrievalResult/surface_pressure  - surface pressure (hPa)
    SoundingGeometry/solarZenith      - solar zenith angle
    SoundingGeometry/viewZenith       - view zenith angle
    SoundingGeometry/landFraction     - land fraction
    RetrievalResult/pressure_level    - pressure levels (N, 16)
    RetrievalResult/co2_profile       - CO2 profile (N, 15)
    RetrievalResult/co2_profile_uncert- CO2 profile uncertainty (N, 15)
    RetrievalResult/xco2_column_averaging_kernel - (N, 15)

Ví dụ:
    python import_gosat2.py GOSAT2TFTS220211029_02SWFPV0220000018.h5
    python import_gosat2.py GOSAT2TFTS220211029_02SWFPV0220000018.h5 --bbox "8,102,24,110" --quality-only
    python import_gosat2.py GOSAT2TFTS220211029_02SWFPV0220000018.h5 --batch-size 1000 --no-profiles
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
DATA_SOURCE = "GOSAT2"
FILE_FORMAT = "HDF5"
SATELLITE_NAME = "GOSAT-2"
SATELLITE_OPERATOR = "JAXA"


def parse_args():
    """Phân tích các tham số dòng lệnh"""
    p = argparse.ArgumentParser(description="Import GOSAT-2 .h5 file into CO2 Management DB")
    p.add_argument("path", help="Path to .h5 file or directory containing .h5 files")
    p.add_argument("--db-url", default=os.environ.get("DATABASE_URL"), help="PostgreSQL DSN")
    p.add_argument("--satellite-id", type=int, default=None)
    p.add_argument("--quality-only", action="store_true", help="Only import flag==0 soundings")
    p.add_argument("--bbox", default=None, help="lat_min,lon_min,lat_max,lon_max")
    p.add_argument("--batch-size", type=int, default=2000)
    p.add_argument("--no-profiles", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()


def get_db_url(args):
    """Xác định URL kết nối cơ sở dữ liệu"""
    db_url = args.db_url
    if db_url:
        if db_url.startswith("postgis://"):
            db_url = db_url.replace("postgis://", "postgresql://", 1)
        return db_url
    try:
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
    """Tính mã băm SHA-256 để kiểm tra trùng lặp tệp"""
    sha = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest()


def parse_gosat2_time(obs_time_bytes) -> datetime | None:
    """Chuyển đổi nhãn thời gian ISO của GOSAT-2 thành đối tượng datetime."""
    try:
        ts = obs_time_bytes.decode("utf-8").strip()
        # Xử lý phần thập phân của giây
        if "." in ts:
            ts_part, frac = ts.rstrip("Z").split(".")
            dt = datetime.strptime(ts_part, "%Y-%m-%dT%H:%M:%S")
            microseconds = int(frac.ljust(6, "0")[:6])
            dt = dt.replace(microsecond=microseconds, tzinfo=timezone.utc)
        else:
            dt = datetime.strptime(ts.rstrip("Z"), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def get_or_create_satellite(cur, satellite_id: int | None) -> int:
    """Lấy hoặc tạo mới bản ghi vệ tinh GOSAT-2"""
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
    """Tạo bản ghi nguồn dữ liệu cho tệp GOSAT-2"""
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

    # Parse algorithm version from filename: GOSAT2TFTS220211029_02SWFPV0220000018.h5
    # "02SWFPV02" = version info
    alg_version = "02SWFPV02"
    try:
        alg_version = file_name.split("_")[1][:9]
    except Exception:
        pass

    cur.execute(
        """INSERT INTO co2_management_measurementsource
           (satellite_id, file_name, file_format, file_size_mb, measurement_date,
            total_soundings, quality_checked, processing_level, algorithm_version, file_hash)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id""",
        (
            sat_id, file_name, FILE_FORMAT, file_size_mb, measurement_date,
            n_soundings, False, "L2", alg_version, file_hash
        ),
    )
    source_id = cur.fetchone()[0]
    log.info(f"Created MeasurementSource id={source_id} for '{file_name}'")
    return source_id


def load_gosat2_data(f, quality_only: bool, bbox) -> dict:
    """Read and filter all GOSAT-2 soundings from open HDF5 file."""
    log.info("Reading GOSAT-2 datasets from file...")

    lat = f["SoundingGeometry/latitude"][:]
    lon = f["SoundingGeometry/longitude"][:]
    xco2 = f["RetrievalResult/xco2"][:]
    xco2_unc = f["RetrievalResult/xco2_uncert"][:]
    qflag = f["RetrievalResult/xco2_quality_flag"][:]
    obs_time = f["SoundingAttribute/observationTime"][:]
    sounding_uid = f["SoundingAttribute/soundingUniqueID"][:]
    surface_p = f["RetrievalResult/surface_pressure"][:]
    solar_zen = f["SoundingGeometry/solarZenith"][:]
    view_zen = f["SoundingGeometry/viewZenith"][:]
    land_frac = f["SoundingGeometry/landFraction"][:]
    pressure_levels = f["RetrievalResult/pressure_level"][:]       # (N, 16) - pressure levels
    co2_profile = f["RetrievalResult/co2_profile"][:]              # (N, 15) - CO2 profile
    co2_profile_unc = f["RetrievalResult/co2_profile_uncert"][:]   # (N, 15)
    ak = f["RetrievalResult/xco2_column_averaging_kernel"][:]      # (N, 15)

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

    # ── Mask: valid XCO2
    mask &= np.isfinite(xco2.astype(float)) & (xco2 > 0)

    indices = np.where(mask)[0]
    log.info(f"Total soundings to import: {len(indices)} / {len(lat)}")

    return {
        "indices": indices,
        "lat": lat,
        "lon": lon,
        "xco2": xco2,
        "xco2_unc": xco2_unc,
        "qflag": qflag,
        "obs_time": obs_time,
        "sounding_uid": sounding_uid,
        "surface_p": surface_p,
        "solar_zen": solar_zen,
        "view_zen": view_zen,
        "land_frac": land_frac,
        "pressure_levels": pressure_levels,
        "co2_profile": co2_profile,
        "co2_profile_unc": co2_profile_unc,
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
    obs_time = data["obs_time"]
    surface_p = data["surface_p"]
    solar_zen = data["solar_zen"]
    view_zen = data["view_zen"]
    land_frac = data["land_frac"]

    id_map = []
    total = len(indices)
    skipped = 0

    for batch_start in range(0, total, batch_size):
        batch_indices = indices[batch_start : batch_start + batch_size]
        rows = []

        for i in batch_indices:
            dt = parse_gosat2_time(obs_time[i])
            if dt is None:
                skipped += 1
                continue

            lat_v = float(lat[i])
            lon_v = float(lon[i])
            xco2_v = float(xco2[i])
            unc_v = float(xco2_unc[i]) if np.isfinite(float(xco2_unc[i])) else None
            qf_v = int(qflag[i])
            sp_v = float(surface_p[i]) if np.isfinite(float(surface_p[i])) else None
            sza_v = float(solar_zen[i]) if np.isfinite(float(solar_zen[i])) else None
            vza_v = float(view_zen[i]) if np.isfinite(float(view_zen[i])) else None
            lf_v = float(land_frac[i]) if np.isfinite(float(land_frac[i])) else None

            rows.append((
                source_id,
                lon_v, lat_v,   # ST_MakePoint(lon, lat)
                lat_v, lon_v,
                xco2_v,
                unc_v,
                qf_v,
                sp_v,
                sza_v,
                vza_v,
                lf_v,
                DATA_SOURCE,
                dt.isoformat(),
                int(i),  # keep original index
            ))

        if not rows:
            continue

        # Keep track of original indices for profile insertion
        row_orig_indices = [r[-1] for r in rows]
        rows_no_idx = [r[:-1] for r in rows]

        args_str = b",".join(cur.mogrify(
            "(%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL)",
            row
        ) for row in rows_no_idx)

        cur.execute(
            b"""INSERT INTO co2_management_measurement
                (source_id, geom, latitude, longitude,
                 xco2_ppm, xco2_uncertainty_ppm, xco2_quality_flag,
                 surface_pressure_hpa, solar_zenith_angle_deg, view_zenith_angle_deg,
                 land_fraction, data_source, measurement_time, deleted_at)
                VALUES """ + args_str + b" RETURNING id"
        )
        new_ids = [row[0] for row in cur.fetchall()]
        for orig_idx, db_id in zip(row_orig_indices, new_ids):
            id_map.append((int(orig_idx), db_id))

        pct = min(100, round((batch_start + len(batch_indices)) / total * 100))
        log.info(f"  Measurements: {batch_start + len(batch_indices)}/{total} ({pct}%)")

    if skipped:
        log.warning(f"Skipped {skipped} soundings with unparseable timestamps")

    return id_map


def bulk_insert_profiles(cur, id_map: list, data: dict, batch_size: int):
    """Bulk insert vertical profiles for each measurement.
    
    GOSAT-2 has pressure_level (N, 16) - 16 pressure boundaries
    and co2_profile (N, 15) - 15 layer values.
    We use the midpoint pressures between boundaries.
    """
    pressure_levels = data["pressure_levels"]   # (N, 16)
    co2_profile = data["co2_profile"]           # (N, 15)
    co2_profile_unc = data["co2_profile_unc"]   # (N, 15)
    ak = data["ak"]                              # (N, 15)

    n_levels = co2_profile.shape[1]   # 15 layers
    log.info(f"Inserting vertical profiles ({n_levels} levels × {len(id_map)} soundings)...")

    profile_rows = []

    for orig_idx, db_id in id_map:
        # Compute midpoint pressure for each layer
        p_bounds = pressure_levels[orig_idx]  # 16 boundaries
        for lvl in range(n_levels):
            p_mid = (float(p_bounds[lvl]) + float(p_bounds[lvl + 1])) / 2.0

            co2_v = float(co2_profile[orig_idx, lvl])
            unc_v = float(co2_profile_unc[orig_idx, lvl])
            ak_v = float(ak[orig_idx, lvl])

            profile_rows.append((
                db_id,
                lvl,
                p_mid if np.isfinite(p_mid) else None,
                co2_v if np.isfinite(co2_v) else None,
                unc_v if np.isfinite(unc_v) else None,
                None,   # temperature_k not directly available
                ak_v if np.isfinite(ak_v) else None,
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
    valid_xco2 = xco2[indices].astype(float)
    valid_xco2 = valid_xco2[np.isfinite(valid_xco2)]

    cur.execute(
        "UPDATE co2_management_measurementsource SET quality_checked = TRUE, total_soundings = %s WHERE id = %s",
        (n_inserted, source_id),
    )
    if len(valid_xco2) > 0:
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

    # ── Compute hash
    log.info("Computing SHA-256 hash...")
    file_hash = compute_sha256(file_path)
    log.info(f"Hash: {file_hash}")

    t0 = time.time()
    try:
        with h5py.File(file_path, "r") as f:
            # Get measurement date from first valid timestamp
            obs_time_arr = f["SoundingAttribute/observationTime"][:]
            first_dt = parse_gosat2_time(obs_time_arr[0])
            measurement_date = first_dt.date() if first_dt else None
            log.info(f"Measurement date: {measurement_date}")
            log.info(f"Total soundings in file: {len(obs_time_arr)}")

            data = load_gosat2_data(f, args.quality_only, bbox)

            if args.dry_run:
                log.info(f"DRY RUN: would import {len(data['indices'])} soundings")
                return

            if len(data["indices"]) == 0:
                log.warning("No soundings passed the filter. Nothing to import.")
                return

            try:
                sat_id = get_or_create_satellite(cur, args.satellite_id)

                source_id = get_or_create_source(
                    cur, sat_id, file_path, file_hash,
                    len(data["indices"]), measurement_date
                )
                if source_id is None:
                    log.warning("Duplicate file, aborting.")
                    conn.rollback()
                    return

                log.info("Bulk inserting measurements...")
                id_map = bulk_insert_measurements(cur, source_id, data, args.batch_size)
                log.info(f"Inserted {len(id_map)} measurements.")

                if not args.no_profiles:
                    bulk_insert_profiles(cur, id_map, data, args.batch_size)

                update_source_metadata(cur, source_id, data, len(id_map))

                conn.commit()
                elapsed = round(time.time() - t0, 1)
                log.info(f"✅ Done! Imported {len(id_map)} GOSAT-2 soundings in {elapsed}s")

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

    log.info("=== GOSAT-2 Import Script ===")

    files_to_process = []
    if os.path.isdir(args.path):
        log.info(f"Scanning directory {args.path} for .h5 files...")
        files_to_process = glob.glob(os.path.join(args.path, '**', '*.h5'), recursive=True)
    else:
        files_to_process = [args.path]

    if not files_to_process:
        log.warning("No .h5 files found to process.")
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
