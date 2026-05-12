# 📊 ER Diagram - CO2 Management Database

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     CO2 MANAGEMENT DATABASE SCHEMA (ER Diagram)               │
└──────────────────────────────────────────────────────────────────────────────┘


                              🛰️ SATELLITE INFRASTRUCTURE
    
    ┌─────────────────────────┐         ┌──────────────────────────┐
    │     satellites          │         │ satellite_instruments    │
    ├─────────────────────────┤         ├──────────────────────────┤
    │ satellite_id (PK)       │◄───1───N│ instrument_id (PK)       │
    │ satellite_name (U)      │ (1)     │ satellite_id (FK)        │
    │ launch_date             │         │ instrument_name          │
    │ operator                │         │ instrument_type          │
    │ orbital_altitude_km     │         │ spectral_bands           │
    │ orbital_period_minutes  │         │ spectral_range_min/max   │
    │ orbital_inclination_deg │         │ spatial_resolution_km    │
    │ is_active               │         │ field_of_view_deg        │
    │ created_at, updated_at  │         │ created_at               │
    └─────────────────────────┘         └──────────────────────────┘


                              📊 DATA INGESTION
    
    ┌──────────────────────────────┐
    │  measurement_sources         │ ◄─────── Files imported
    ├──────────────────────────────┤
    │ source_id (PK)               │
    │ satellite_id (FK)◄───────────┤──→ satellites
    │ file_name                    │
    │ file_path                    │
    │ file_format (netCDF4|HDF5)   │
    │ file_size_mb                 │
    │ file_hash (U)                │
    │ measurement_date             │
    │ measurement_start/end_time   │
    │ total_soundings              │
    │ valid_soundings              │
    │ processing_level             │
    │ data_version                 │
    │ algorithm_name               │
    │ algorithm_version            │
    │ processing_facility          │
    │ quality_checked              │
    │ import_date                  │
    │ created_at, updated_at       │
    └──────────────────────────────┘
              1 │
                N
                │
    ┌──────────────────────────────┐
    │  measurement_metadata        │ (1:1 relation)
    ├──────────────────────────────┤
    │ metadata_id (PK)             │
    │ source_id (FK) (U)           │
    │ min/max_latitude             │
    │ min/max_longitude            │
    │ min/max/mean/std_xco2_ppm    │
    │ percent_valid_soundings      │
    │ cloud_free_percent           │
    │ land/ocean_percent           │
    │ mean_solar_zenith_angle      │
    │ mean_view_zenith_angle       │
    │ created_at                   │
    └──────────────────────────────┘


                              🔬 MEASUREMENTS (CORE DATA)
    
    ┌────────────────────────────────────────────────────────────────┐
    │                      measurements                              │
    ├────────────────────────────────────────────────────────────────┤
    │ measurement_id (BIGINT PK) ◄─── ~61+ million records           │
    │ source_id (FK)             ───→ measurement_sources             │
    │                                                                │
    │ ─── GEOLOCATION ───                                            │
    │ latitude (DECIMAL 10,6)    ◄─── Indexed                        │
    │ longitude (DECIMAL 10,6)   ◄─── Indexed                        │
    │ geom (POINT SRID 4326)     ◄─── SPATIAL INDEX                  │
    │ altitude_m                                                     │
    │ measurement_time           ◄─── Indexed                        │
    │                                                                │
    │ ─── XCO2 (PRIMARY VARIABLE) ───                                │
    │ xco2_ppm ⭐                ◄─── Main variable, Indexed          │
    │ xco2_uncertainty_ppm                                           │
    │ xco2_quality_flag          ◄─── Indexed (0=good)               │
    │ xco2_apriori_ppm                                               │
    │                                                                │
    │ ─── PRESSURE/ALTITUDE ───                                      │
    │ surface_pressure_hpa                                           │
    │ surface_altitude_m                                             │
    │                                                                │
    │ ─── GEOMETRY ───                                               │
    │ solar_zenith_angle_deg                                         │
    │ solar_azimuth_angle_deg                                        │
    │ view_zenith_angle_deg                                          │
    │ view_azimuth_angle_deg                                         │
    │ relative_azimuth_angle_deg                                     │
    │                                                                │
    │ ─── QUALITY/DIAGNOSTICS ───                                    │
    │ degrees_of_freedom                                             │
    │ spectral_snr_band1/2/3                                         │
    │                                                                │
    │ ─── SURFACE PROPERTIES ───                                     │
    │ land_water_flag            ◄─── Indexed (0=ocean, 1=land)      │
    │ land_fraction                                                  │
    │ cloud_flag                 ◄─── Indexed                        │
    │ cloud_optical_depth                                            │
    │ cloud_height_m                                                 │
    │ aerosol_flag                                                   │
    │ aerosol_optical_depth                                          │
    │ row_anomaly_flag                                               │
    │ sunglint_flag                                                  │
    │ ice_snow_flag                                                  │
    │                                                                │
    │ ─── DATA SOURCE ───                                            │
    │ data_source (ENUM)         ◄─── 'OCO2' or 'GOSAT2', Indexed    │
    │                                                                │
    │ created_at, updated_at                                         │
    └────────────────────────────────────────────────────────────────┘
              1 │
                N
                ├─ vertical_profiles (1:N, 15-20 per measurement)
                ├─ quality_assessments (1:1, optional)
                └─ temporal_series (1:N, if in monitoring area)


    ┌──────────────────────────────────┐
    │  vertical_profiles (PROFILES)    │ ◄─── ~900M records total
    ├──────────────────────────────────┤
    │ profile_id (BIGINT PK)           │
    │ measurement_id (FK)◄─────────────┤──→ measurements
    │ level_index (1-20 OCO2, 1-15 G2) │
    │ pressure_hpa                     │
    │ altitude_m                       │
    │ co2_concentration_ppm            │
    │ co2_apriori_ppm                  │
    │ co2_uncertainty_ppm              │
    │ ch4_concentration_ppb (optional) │
    │ h2o_concentration_ppm (optional) │
    │ co_concentration_ppb (optional)  │
    │ temperature_k                    │
    │ averaging_kernel                 │
    │ pressure_weighting_function      │
    │ created_at                       │
    └──────────────────────────────────┘


    ┌──────────────────────────────────┐
    │  quality_assessments             │
    ├──────────────────────────────────┤
    │ assessment_id (PK)               │
    │ measurement_id (FK)◄─────────────┤──→ measurements
    │ quality_score (0-100)            │
    │ is_valid (BOOLEAN)               │
    │ validation_flags (JSON)          │
    │ error_messages (TEXT)            │
    │ assessment_date                  │
    │ assessor_id                      │
    │ notes                            │
    └──────────────────────────────────┘


                              📍 GEOSPATIAL ANALYSIS
    
    ┌──────────────────────────────────┐
    │  monitoring_locations            │
    ├──────────────────────────────────┤
    │ location_id (PK)                 │
    │ location_name                    │
    │ location_type (ENUM)             │
    │ latitude, longitude              │
    │ geom (POINT) ◄─── SPATIAL INDEX  │
    │ radius_km                        │
    │ country, state_province          │
    │ description                      │
    │ is_active                        │
    │ created_at, updated_at           │
    └──────────────────────────────────┘
              1 │
                N
                │
    ┌──────────────────────────────────┐
    │  temporal_series                 │
    ├──────────────────────────────────┤
    │ series_id (BIGINT PK)            │
    │ location_id (FK)◄────────────────┤──→ monitoring_locations
    │ measurement_id (FK)◄─────────────┤──→ measurements
    │ measurement_date                 │
    │ xco2_ppm                         │
    │ xco2_uncertainty                 │
    │ data_source (ENUM)               │
    │ created_at                       │
    └──────────────────────────────────┘


                              🔄 DATA COMPARISON
    
    ┌──────────────────────────────────┐
    │  data_comparisons                │
    ├──────────────────────────────────┤
    │ comparison_id (PK)               │
    │ oco2_measurement_id (FK)◄────────┤──→ measurements (OCO2)
    │ gosat2_measurement_id (FK)◄──────┤──→ measurements (GOSAT2)
    │ spatial_distance_km              │
    │ temporal_distance_hours          │
    │ xco2_difference_ppm              │
    │ relative_difference_percent      │
    │ comparison_type (ENUM)           │
    │ comparison_date                  │
    │ notes                            │
    └──────────────────────────────────┘


                              ⚙️ ANALYSIS & ADMINISTRATION
    
    ┌──────────────────────────────────┐
    │  analysis_jobs                   │
    ├──────────────────────────────────┤
    │ job_id (PK)                      │
    │ user_id (FK)◄─────────────────┐  │
    │ job_name                      │  │
    │ job_description               │  │
    │ job_type (ENUM)               │  │
    │ source_ids (JSON)             │  │
    │ parameters (JSON)             │  │
    │ status (ENUM)                 │  │
    │ progress_percent              │  │
    │ result_path                   │  │
    │ result_summary (JSON)         │  │
    │ error_message                 │  │
    │ execution_time_seconds        │  │
    │ created_at, started_at        │  │
    │ completed_at                  │  │
    └──────────────────────────────────┘
                                       │
    ┌──────────────────────────────────────────┐
    │  users (geonode user)                    │
    ├──────────────────────────────────────────┤
                       1 │
                         N
                         │
    ┌──────────────────────────────────┐
    │  audit_log                       │
    ├──────────────────────────────────┤
    │ log_id (BIGINT PK)               │
    │ user_id (FK)◄────────────────────┤──→ users
    │ action (INSERT|UPDATE|DELETE)    │
    │ table_name                       │
    │ record_id                        │
    │ old_value (JSON)                 │
    │ new_value (JSON)                 │
    │ ip_address, user_agent           │
    │ description                      │
    │ created_at                       │
    └──────────────────────────────────┘

    ┌──────────────────────────────────┐
    │  system_configuration            │
    ├──────────────────────────────────┤
    │ config_id (PK)                   │
    │ config_key (U)                   │
    │ config_value (TEXT)              │
    │ config_type                      │
    │ description                      │
    │ is_sensitive (BOOLEAN)           │
    │ updated_by (FK) ──→ users        │
    │ updated_at                       │
    └──────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────┐
│                           SUMMARY STATISTICS                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Total Tables: 14                                                              │
│ Primary Keys: 14                                                              │
│ Foreign Keys: 12                                                              │
│ Total Indexes: 50+                                                            │
│ Spatial Indexes: 2 (geom columns)                                             │
│ Partitioned Tables: measurements, vertical_profiles (by time)                │
│ Estimated Size: ~150 GB (with 61M+ measurements)                             │
│ Max Records: BIGINT (9,223,372,036,854,775,807)                              │
└──────────────────────────────────────────────────────────────────────────────┘


🔗 KEY RELATIONSHIPS
═══════════════════════════════════════════════════════════════════════════════

1. satellites → satellite_instruments (1:N)
   One satellite has many instruments

2. satellites → measurement_sources (1:N)
   One satellite has many data sources/files

3. measurement_sources → measurement_metadata (1:1)
   Each source has one metadata record

4. measurement_sources → measurements (1:N)
   One source contains many measurements (~61M)

5. measurements → vertical_profiles (1:N)
   Each measurement has 15-20 vertical profiles

6. measurements → quality_assessments (1:1, optional)
   Each measurement may have a quality assessment

7. monitoring_locations → temporal_series (1:N)
   One location tracks many time series points

8. temporal_series ← measurements (N:1)
   Time series are built from measurements

9. measurements ←→ data_comparisons (many:many)
   Measurements can be compared (OCO2 vs GOSAT2)

10. users → analysis_jobs (1:N)
    One user submits many analysis jobs

11. users → audit_log (1:N)
    One user generates many audit log entries


🔍 SPATIAL QUERIES
═══════════════════════════════════════════════════════════════════════════════

-- Find all measurements within 10km of a location
SELECT * FROM measurements
WHERE ST_Distance_Sphere(geom, ST_GeomFromText('POINT(21.5 105.8)', 4326)) / 1000 < 10;

-- Find measurements in a circular region
SELECT * FROM measurements
WHERE ST_Contains(
    ST_Buffer(ST_GeomFromText('POINT(21.5 105.8)', 4326), 0.1),
    geom
);

-- Find nearest OCO2 measurement to GOSAT2 measurement
SELECT m1.*, m2.* FROM measurements m1
CROSS JOIN measurements m2
WHERE m1.data_source = 'OCO2'
  AND m2.data_source = 'GOSAT2'
ORDER BY ST_Distance(m1.geom, m2.geom)
LIMIT 1;


⏱️ TEMPORAL QUERIES
═══════════════════════════════════════════════════════════════════════════════

-- Monthly average XCO2 at a location
SELECT 
    DATE_TRUNC('month', measurement_date) as month,
    AVG(xco2_ppm) as monthly_avg,
    STDDEV(xco2_ppm) as monthly_std,
    COUNT(*) as count
FROM temporal_series
WHERE location_id = ?
GROUP BY DATE_TRUNC('month', measurement_date)
ORDER BY month;

-- Year-over-year comparison
SELECT 
    YEAR(measurement_date) as year,
    MONTH(measurement_date) as month,
    AVG(xco2_ppm) as avg_xco2
FROM temporal_series
WHERE location_id = ?
GROUP BY YEAR(measurement_date), MONTH(measurement_date);


📊 AGGREGATION QUERIES
═══════════════════════════════════════════════════════════════════════════════

-- Data quality summary
SELECT 
    data_source,
    COUNT(*) as total_measurements,
    SUM(CASE WHEN xco2_quality_flag = 0 THEN 1 ELSE 0 END) as valid_measurements,
    AVG(xco2_ppm) as mean_xco2,
    MIN(xco2_ppm) as min_xco2,
    MAX(xco2_ppm) as max_xco2,
    STDDEV(xco2_ppm) as std_xco2
FROM measurements
GROUP BY data_source;

-- OCO-2 vs GOSAT-2 comparison at same locations
SELECT 
    COALESCE(oco2.data_source, gosat2.data_source) as source,
    COUNT(*) as measurements,
    AVG(COALESCE(oco2.xco2_ppm, gosat2.xco2_ppm)) as avg_xco2,
    AVG(CASE WHEN oco2.xco2_ppm IS NOT NULL 
             AND gosat2.xco2_ppm IS NOT NULL 
             THEN ABS(oco2.xco2_ppm - gosat2.xco2_ppm) 
             ELSE NULL END) as mean_difference
FROM measurements oco2
FULL OUTER JOIN measurements gosat2
    ON ST_Distance(oco2.geom, gosat2.geom) < 10000  -- 10km
    AND oco2.data_source = 'OCO2'
    AND gosat2.data_source = 'GOSAT2'
GROUP BY source;
```

---

## 📋 QUICK REFERENCE GUIDE

### Database Connection Strings

**Development (SQLite)**:
```
sqlite:///co2_management_db.sqlite
```

**Production (MySQL)**:
```
mysql+pymysql://user:password@localhost:3306/co2_management_db
```

**Production (MySQL with SSL)**:
```
mysql+pymysql://user:password@localhost:3306/co2_management_db?ssl_verify_cert=True&ssl_verify_identity=True
```

### Important Indexes

| Table | Column(s) | Type | Purpose |
|-------|-----------|------|---------|
| measurements | geom | SPATIAL | Geographic queries |
| measurements | (source_id, measurement_time) | COMPOSITE | Time-based queries |
| measurements | (data_source, xco2_quality_flag, xco2_ppm) | COVERING | Quality & data analysis |
| temporal_series | (location_id, measurement_date, data_source) | COMPOSITE | Time series lookup |
| measurement_sources | file_hash | UNIQUE | Prevent duplicates |

### Recommended MySQL Configuration

```ini
[mysqld]
# Memory
innodb_buffer_pool_size = 32G          # 50% of available RAM
innodb_log_file_size = 512M

# Performance
innodb_flush_log_at_trx_commit = 2     # Balance safety/performance
max_connections = 1000
query_cache_type = 0                   # MySQL 8.0+ doesn't have this

# Spatial
spatial_index = YES

# Partitioning
default_table_type = InnoDB

# Binary logging (for replication)
log_bin = mysql-bin
binlog_format = ROW
```

### Backup Strategy

```bash
# Daily full backup
mysqldump -u root -p co2_management_db > backup_$(date +%Y%m%d).sql

# With compression
mysqldump -u root -p co2_management_db | gzip > backup_$(date +%Y%m%d).sql.gz

# Incremental (binary logs)
mysqlbinlog mysql-bin.000001 | gzip > binlog_backup_000001.sql.gz
```

---

## 🎯 Use Case Examples

### 1. Import OCO-2 File
```
1. Check file_hash in measurement_sources
2. If not exists: INSERT measurement_source + measurement_metadata
3. Parse .nc4 file → INSERT measurements (61,115 records)
4. INSERT vertical_profiles (61,115 × 20 = 1,223,300 records)
5. Run quality check → INSERT quality_assessments
6. Update measurement_source.quality_checked = TRUE
```

### 2. Import GOSAT-2 File
```
1. Check file_hash in measurement_sources
2. If not exists: INSERT measurement_source + measurement_metadata
3. Parse .h5 file → INSERT measurements (835 records)
4. INSERT vertical_profiles (835 × 15 = 12,525 records)
5. Run quality check → INSERT quality_assessments
6. Update measurement_source.quality_checked = TRUE
```

### 3. Find Overlaps Between OCO-2 and GOSAT-2
```
1. Query measurements with data_source IN ('OCO2', 'GOSAT2')
2. Find spatial distance < 50km between pairs
3. Find temporal distance < 1 hour between pairs
4. Calculate XCO2 difference
5. INSERT data_comparisons
6. Analyze results
```

### 4. Generate Temporal Series for a City
```
1. Get monitoring_location (e.g., Hanoi)
2. Find all measurements within radius_km
3. For each measurement, INSERT temporal_series
4. Calculate monthly/seasonal averages
5. Generate trend analysis
```

---

**Database Design Version**: 1.0  
**Last Updated**: 2024-01-15  
**Maintained By**: CO2 Data Management Team