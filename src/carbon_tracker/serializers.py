def point_to_geojson(point):
    if point is None:
        return None
    return {
        "type": "Point",
        "coordinates": [point.x, point.y],
    }


def serialize_oco2_feature(record):
    return {
        "type": "Feature",
        "id": str(record.sounding_id),
        "geometry": point_to_geojson(record.location),
        "properties": {
            "record_id": str(record.sounding_id),
            "sounding_id": str(record.sounding_id),
            "display_id": str(record.sounding_id),
            "acquisition_time": record.acquisition_time.isoformat()
            if record.acquisition_time
            else None,
            "xco2": record.xco2,
            "xco2_uncertainty": record.xco2_uncertainty,
            "xco2_quality_flag": record.xco2_quality_flag,
            "latitude": record.latitude,
            "longitude": record.longitude,
            "orbit": record.orbit,
            "operation_mode": record.operation_mode,
            "source_file": record.source_file,
            "source_folder": record.source_folder,
            "mission": "oco2_vn",
            "mission_label": "OCO-2 Vietnam",
        },
    }


def serialize_gosat_feature(record):
    retrieval = getattr(record, "retrieval", None)
    product = getattr(record, "product", None)
    return {
        "type": "Feature",
        "id": str(record.pk),
        "geometry": point_to_geojson(record.geom),
        "properties": {
            "record_id": str(record.pk),
            "sounding_id": str(record.pk),
            "display_id": record.sounding_unique_id or f"Sounding {record.pk}",
            "sounding_unique_id": record.sounding_unique_id,
            "acquisition_time": record.observation_time.isoformat()
            if record.observation_time
            else None,
            "xco2": getattr(retrieval, "xco2", None),
            "xco2_uncertainty": getattr(retrieval, "xco2_uncert", None),
            "xco2_quality_flag": getattr(retrieval, "xco2_quality_flag", None),
            "latitude": record.latitude,
            "longitude": record.longitude,
            "operation_mode": record.detailed_operation_mode,
            "sunglint_flag": record.sunglint_flag,
            "sensor_name": getattr(product, "sensor_name", None),
            "product_version": getattr(product, "product_version", None),
            "processing_level": getattr(product, "processing_level", None),
            "file_id": getattr(product, "file_id", None),
            "file_name": getattr(product, "file_name", None),
            "source_file": getattr(product, "file_name", None),
            "source_folder": getattr(product, "file_path", None),
            "mission": "gosat2_vn",
            "mission_label": "GOSAT-2 Vietnam",
        },
    }
