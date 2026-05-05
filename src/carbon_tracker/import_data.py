import math
import os
from typing import Any, Dict, List, Optional

import h5py
import numpy as np
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_datetime
from django.utils.timezone import make_aware, is_naive
from models import (
    AlbedoCoefficient,
    CloudInformation,
    GosatProduct,
    H5DatasetCatalog,
    L1QualityBand,
    L1QualitySummary,
    ProfileLayer,
    RetrievalResult,
    RetrievalSubbandParameter,
    Sounding,
)


FILL_VALUES = {-9999, -999, 9999, -9999.0, -999.0, 9999.0}


METADATA_MAP = {
    "satellite_name": "Metadata/satelliteName",
    "sensor_name": "Metadata/sensorName",
    "processing_level": "Metadata/processingLevel",
    "product_version": "Metadata/productVersion",
    "algorithm_name": "Metadata/algorithmName",
    "algorithm_version": "Metadata/algorithmVersion",
    "input_data_version": "Metadata/inputDataVersion",
    "start_date": "Metadata/startDate",
    "end_date": "Metadata/endDate",
    "processing_date": "Metadata/processingDate",
    "processing_facility": "Metadata/processingFacility",
    "file_id": "Metadata/fileID",
    "geodetic_datum": "Metadata/geodeticDatum",
}


SCENE_MAP = {
    "num_sounding": "SceneAttribute/numSounding",
    "num_layer": "SceneAttribute/numLayer",
    "num_band": "SceneAttribute/numBand",
}


SOUNDING_MAP = {
    "sounding_unique_id": "SoundingAttribute/soundingUniqueID",
    "observation_request_id": "SoundingAttribute/observationRequestID",
    "observation_time": "SoundingAttribute/observationTime",
    "latitude": "SoundingGeometry/latitude",
    "longitude": "SoundingGeometry/longitude",
    "height": "SoundingGeometry/height",
    "land_fraction": "SoundingGeometry/landFraction",
    "solar_zenith": "SoundingGeometry/solarZenith",
    "solar_azimuth": "SoundingGeometry/solarAzimuth",
    "view_zenith": "SoundingGeometry/viewZenith",
    "view_azimuth": "SoundingGeometry/viewAzimuth",
    "solar_distance": "SoundingGeometry/solarDistance",
    "specular_view_vector_angle": "SoundingGeometry/specular_viewVector_angle",
    "surface_roughness": "SoundingGeometry/surfaceRoughness",
    "sunglint_flag": "SoundingGeometry/sunglintFlag",
    "detailed_operation_mode": "SoundingAttribute/detailedOperationMode",
    "scan_direction": "SoundingAttribute/scanDirection",
    "pointing_at": "SoundingAttribute/pointingAT",
    "pointing_ct": "SoundingAttribute/pointingCT",
    "ip_request": "SoundingAttribute/IP_Request",
    "yaw_steering_flag": "SoundingAttribute/yawSteeringFlag",
}


RETRIEVAL_MAP = {
    "xco2": "RetrievalResult/xco2",
    "xco2_apriori": "RetrievalResult/xco2_apriori",
    "xco2_uncert": "RetrievalResult/xco2_uncert",
    "xco2_dfs": "RetrievalResult/xco2_dfs",
    "xco2_quality_flag": "RetrievalResult/xco2_quality_flag",
    "xch4": "RetrievalResult/xch4",
    "xch4_apriori": "RetrievalResult/xch4_apriori",
    "xch4_uncert": "RetrievalResult/xch4_uncert",
    "xch4_dfs": "RetrievalResult/xch4_dfs",
    "xch4_quality_flag": "RetrievalResult/xch4_quality_flag",
    "xco": "RetrievalResult/xco",
    "xco_apriori": "RetrievalResult/xco_apriori",
    "xco_uncert": "RetrievalResult/xco_uncert",
    "xco_dfs": "RetrievalResult/xco_dfs",
    "xco_quality_flag": "RetrievalResult/xco_quality_flag",
    "xh2o": "RetrievalResult/xh2o",
    "xh2o_apriori": "RetrievalResult/xh2o_apriori",
    "xh2o_uncert": "RetrievalResult/xh2o_uncert",
    "xh2o_dfs": "RetrievalResult/xh2o_dfs",
    "xh2o_quality_flag": "RetrievalResult/xh2o_quality_flag",
    "dry_air_column": "RetrievalResult/dry_air_column",
    "dry_air_column_apriori": "RetrievalResult/dry_air_column_apriori",
    "surface_pressure": "RetrievalResult/surface_pressure",
    "surface_pressure_apriori": "RetrievalResult/surface_pressure_apriori",
    "surface_pressure_uncert": "RetrievalResult/surface_pressure_uncert",
    "wind_speed": "RetrievalResult/wind_speed",
    "wind_speed_apriori": "RetrievalResult/wind_speed_apriori",
    "wind_speed_uncert": "RetrievalResult/wind_speed_uncert",
    "temperature_shift": "RetrievalResult/temperature_shift",
    "temperature_shift_apriori": "RetrievalResult/temperature_shift_apriori",
    "temperature_shift_uncert": "RetrievalResult/temperature_shift_uncert",
    "fluorescence_at_reference": "RetrievalResult/fluorescence_at_reference",
    "fluorescence_at_reference_apriori": "RetrievalResult/fluorescence_at_reference_apriori",
    "fluorescence_at_reference_uncert": "RetrievalResult/fluorescence_at_reference_uncert",
    "fluorescence_slope": "RetrievalResult/fluorescence_slope",
    "fluorescence_slope_apriori": "RetrievalResult/fluorescence_slope_apriori",
    "fluorescence_slope_uncert": "RetrievalResult/fluorescence_slope_uncert",
    "iteration": "RetrievalResult/iteration",
}


CLOUD_PATHS = {
    "fts2_2um": "CloudInformation/FTS-2_2um",
    "fts2_tir": "CloudInformation/FTS-2_TIR",
    "ch4_ratio": "CloudInformation/ch4Ratio",
    "co2_ratio": "CloudInformation/co2Ratio",
    "h2o_ratio": "CloudInformation/h2oRatio",
    "surface_pressure_delta": "CloudInformation/surface_pressure_delta",
    "cai2_cldd": "CloudInformation/CAI-2_CLDD",
    "cai2_coherent": "CloudInformation/CAI-2_Coherent",
}


L1_SUMMARY_MAP = {
    "sounding_quality_flag": "L1QualityInfo/soundingQualityFlag",
    "scan_stability_flag": "L1QualityInfo/scanStabilityFlag",
    "imc_stability_flag": "L1QualityInfo/IMC_StabilityFlag",
}


L1_BAND_MAP = {
    "snr": "L1QualityInfo/SNR",
    "snr_synthesized": "L1QualityInfo/SNR_synthesized",
    "interferogram_quality_flag": "L1QualityInfo/interferogramQualityFlag",
    "missing_flag": "L1QualityInfo/missingFlag",
    "saturation_flag": "L1QualityInfo/saturationFlag",
    "spectrum_quality_flag": "L1QualityInfo/spectrumQualityFlag",
    "spike_flag": "L1QualityInfo/spikeFlag",
    "sensor_gain": "SoundingAttribute/sensorGain",
}


PROFILE_MAP = {
    "co2_profile": "RetrievalResult/co2_profile",
    "co2_profile_apriori": "RetrievalResult/co2_profile_apriori",
    "co2_profile_uncert": "RetrievalResult/co2_profile_uncert",
    "ch4_profile": "RetrievalResult/ch4_profile",
    "ch4_profile_apriori": "RetrievalResult/ch4_profile_apriori",
    "ch4_profile_uncert": "RetrievalResult/ch4_profile_uncert",
    "co_profile": "RetrievalResult/co_profile",
    "co_profile_apriori": "RetrievalResult/co_profile_apriori",
    "co_profile_uncert": "RetrievalResult/co_profile_uncert",
    "h2o_profile": "RetrievalResult/h2o_profile",
    "h2o_profile_apriori": "RetrievalResult/h2o_profile_apriori",
    "h2o_profile_uncert": "RetrievalResult/h2o_profile_uncert",
    "aerosol_profile_type1": "RetrievalResult/aerosol_profile_type1",
    "aerosol_profile_type1_apriori": "RetrievalResult/aerosol_profile_type1_apriori",
    "aerosol_profile_type1_uncert": "RetrievalResult/aerosol_profile_type1_uncert",
    "aerosol_profile_type2": "RetrievalResult/aerosol_profile_type2",
    "aerosol_profile_type2_apriori": "RetrievalResult/aerosol_profile_type2_apriori",
    "aerosol_profile_type2_uncert": "RetrievalResult/aerosol_profile_type2_uncert",
    "xco2_column_averaging_kernel": "RetrievalResult/xco2_column_averaging_kernel",
    "xch4_column_averaging_kernel": "RetrievalResult/xch4_column_averaging_kernel",
    "xco_column_averaging_kernel": "RetrievalResult/xco_column_averaging_kernel",
    "xh2o_column_averaging_kernel": "RetrievalResult/xh2o_column_averaging_kernel",
    "pressure_weighting_function": "RetrievalResult/pressure_weighting_function",
}


PRESSURE_LEVEL_PATH = "RetrievalResult/pressure_level"


ALBEDO_SUBBANDS = {
    1: "RetrievalResult/albedo_subband01",
    2: "RetrievalResult/albedo_subband02",
    3: "RetrievalResult/albedo_subband03",
    4: "RetrievalResult/albedo_subband04",
    5: "RetrievalResult/albedo_subband05",
}


ALBEDO_APRIORI_SUBBANDS = {
    1: "RetrievalResult/albedo_subband01_apriori",
    2: "RetrievalResult/albedo_subband02_apriori",
    3: "RetrievalResult/albedo_subband03_apriori",
    4: "RetrievalResult/albedo_subband04_apriori",
    5: "RetrievalResult/albedo_subband05_apriori",
}


ALBEDO_UNCERT_SUBBANDS = {
    1: "RetrievalResult/albedo_subband01_uncert",
    2: "RetrievalResult/albedo_subband02_uncert",
    3: "RetrievalResult/albedo_subband03_uncert",
    4: "RetrievalResult/albedo_subband04_uncert",
    5: "RetrievalResult/albedo_subband05_uncert",
}


SUBBAND_PARAM_PREFIXES = {
    "residual_reduced_chi2": "RetrievalResult/residual_reduced_chi2_subband{:02d}",
    "dispersion_adjustment": "RetrievalResult/dispersion_adjustment_subband{:02d}",
    "dispersion_adjustment_apriori": "RetrievalResult/dispersion_adjustment_subband{:02d}_apriori",
    "dispersion_adjustment_uncert": "RetrievalResult/dispersion_adjustment_subband{:02d}_uncert",
    "ils_stretch_factor": "RetrievalResult/ils_stretch_factor_subband{:02d}",
    "ils_stretch_factor_apriori": "RetrievalResult/ils_stretch_factor_subband{:02d}_apriori",
    "ils_stretch_factor_uncert": "RetrievalResult/ils_stretch_factor_subband{:02d}_uncert",
    "zero_level_offset": "RetrievalResult/zero_level_offset_subband{:02d}",
    "zero_level_offset_apriori": "RetrievalResult/zero_level_offset_subband{:02d}_apriori",
    "zero_level_offset_uncert": "RetrievalResult/zero_level_offset_subband{:02d}_uncert",
}


def decode_value(value: Any) -> Any:
    """Decode bytes/numpy bytes/list từ HDF5 sang Python value."""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore").strip()
    if isinstance(value, np.bytes_):
        return value.decode("utf-8", errors="ignore").strip()
    if isinstance(value, np.ndarray):
        if value.dtype.kind in {"S", "O"}:
            return np.array([decode_value(v) for v in value.tolist()])
        return value
    if isinstance(value, list):
        return [decode_value(v) for v in value]
    return value


def read_array(h5: h5py.File, path: str) -> Optional[np.ndarray]:
    """Đọc dataset H5 thành numpy array. Trả None nếu không tồn tại."""
    if path not in h5:
        return None
    data = h5[path][()]
    data = decode_value(data)
    return np.asarray(data)


def read_scalar(h5: h5py.File, path: str) -> Any:
    """Đọc scalar/1 phần tử từ H5."""
    arr = read_array(h5, path)
    if arr is None:
        return None
    if arr.ndim == 0:
        return clean_value(arr.item())
    if arr.size == 0:
        return None
    return clean_value(arr.reshape(-1)[0])


def clean_value(value: Any) -> Any:
    """Đưa numpy scalar/fill value/NaN về dạng phù hợp để insert DB."""
    if isinstance(value, np.generic):
        value = value.item()

    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore").strip()

    if isinstance(value, str):
        value = value.strip()
        if value == "" or value.lower() in {"nan", "none", "null"}:
            return None
        return value

    if value is None:
        return None

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value) or abs(value) > 1e30:
            return None
        if value in FILL_VALUES:
            return None
        return value

    if isinstance(value, int):
        if value in FILL_VALUES:
            return None
        return value

    return value


def arr_get(arrays: Dict[str, Optional[np.ndarray]], key: str, index: int, subindex: Optional[int] = None) -> Any:
    arr = arrays.get(key)
    if arr is None:
        return None

    try:
        if subindex is None:
            value = arr[index]
        else:
            value = arr[index, subindex]
    except Exception:
        return None

    return clean_value(value)


def parse_h5_datetime(value: Any) -> Any:
    """Parse datetime từ string H5 sang timezone-aware datetime."""
    value = clean_value(value)
    if not value:
        return None

    text = str(value).strip()
    text = text.replace("Z", "+00:00")

    dt = parse_datetime(text)
    if dt is None:
        # Một số file có format không chuẩn ISO; có thể bổ sung parser ở đây nếu cần.
        return None

    if is_naive(dt):
        dt = make_aware(dt)
    return dt


def array_to_json(value: Any) -> list:
    if value is None:
        return []
    arr = np.asarray(value)
    arr = np.where(np.isfinite(arr), arr, np.nan)
    return arr.tolist()


def get_num_soundings(h5: h5py.File) -> int:
    candidates = [
        "SoundingGeometry/latitude",
        "RetrievalResult/xco2",
        "SoundingAttribute/soundingUniqueID",
    ]
    for path in candidates:
        arr = read_array(h5, path)
        if arr is not None and arr.ndim >= 1:
            return int(arr.shape[0])
    raise CommandError("Không xác định được số lượng sounding trong file H5.")


def load_arrays(h5: h5py.File, mapping: Dict[str, str]) -> Dict[str, Optional[np.ndarray]]:
    return {field: read_array(h5, path) for field, path in mapping.items()}


def create_dataset_catalog(h5: h5py.File, product: GosatProduct, batch_size: int) -> int:
    rows: List[H5DatasetCatalog] = []

    def visitor(name: str, obj: Any) -> None:
        if isinstance(obj, h5py.Dataset):
            h5_group = name.rsplit("/", 1)[0] if "/" in name else ""
            dataset_name = name.rsplit("/", 1)[-1]
            rows.append(
                H5DatasetCatalog(
                    product=product,
                    h5_path=name,
                    h5_group=h5_group,
                    dataset_name=dataset_name,
                    shape=str(obj.shape),
                    dtype=str(obj.dtype),
                )
            )

    h5.visititems(visitor)
    H5DatasetCatalog.objects.bulk_create(rows, batch_size=batch_size)
    return len(rows)


def build_product(h5: h5py.File, file_path: str) -> GosatProduct:
    metadata_json = {}
    product_kwargs = {
        "file_name": os.path.basename(file_path),
        "file_path": os.path.abspath(file_path),
    }

    for field, path in METADATA_MAP.items():
        value = read_scalar(h5, path)
        metadata_json[path] = value
        if field.endswith("date"):
            product_kwargs[field] = parse_h5_datetime(value)
        else:
            product_kwargs[field] = value

    for field, path in SCENE_MAP.items():
        value = read_scalar(h5, path)
        metadata_json[path] = value
        product_kwargs[field] = value

    product_kwargs["metadata_json"] = metadata_json
    return GosatProduct.objects.create(**product_kwargs)


def build_soundings(product: GosatProduct, arrays: Dict[str, Optional[np.ndarray]], n: int) -> List[Sounding]:
    rows = []

    for i in range(n):
        lat = arr_get(arrays, "latitude", i)
        lon = arr_get(arrays, "longitude", i)
        geom = None

        if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
            geom = Point(float(lon), float(lat), srid=4326)

        rows.append(
            Sounding(
                product=product,
                sounding_unique_id=arr_get(arrays, "sounding_unique_id", i),
                observation_request_id=arr_get(arrays, "observation_request_id", i),
                observation_time=parse_h5_datetime(arr_get(arrays, "observation_time", i)),
                latitude=lat,
                longitude=lon,
                height=arr_get(arrays, "height", i),
                geom=geom,
                land_fraction=arr_get(arrays, "land_fraction", i),
                solar_zenith=arr_get(arrays, "solar_zenith", i),
                solar_azimuth=arr_get(arrays, "solar_azimuth", i),
                view_zenith=arr_get(arrays, "view_zenith", i),
                view_azimuth=arr_get(arrays, "view_azimuth", i),
                solar_distance=arr_get(arrays, "solar_distance", i),
                specular_view_vector_angle=arr_get(arrays, "specular_view_vector_angle", i),
                surface_roughness=arr_get(arrays, "surface_roughness", i),
                sunglint_flag=arr_get(arrays, "sunglint_flag", i),
                detailed_operation_mode=arr_get(arrays, "detailed_operation_mode", i),
                scan_direction=arr_get(arrays, "scan_direction", i),
                pointing_at=arr_get(arrays, "pointing_at", i),
                pointing_ct=arr_get(arrays, "pointing_ct", i),
                ip_request=arr_get(arrays, "ip_request", i),
                yaw_steering_flag=arr_get(arrays, "yaw_steering_flag", i),
            )
        )

    return rows


def fetch_soundings(product: GosatProduct) -> List[Sounding]:
    return list(Sounding.objects.filter(product=product).order_by("id"))


def build_retrieval_results(soundings: List[Sounding], arrays: Dict[str, Optional[np.ndarray]]) -> List[RetrievalResult]:
    rows = []
    fields = list(RETRIEVAL_MAP.keys())

    for i, sounding in enumerate(soundings):
        kwargs = {field: arr_get(arrays, field, i) for field in fields}
        rows.append(RetrievalResult(sounding=sounding, **kwargs))

    return rows


def build_cloud_information(h5: h5py.File, soundings: List[Sounding]) -> List[CloudInformation]:
    fts2_2um = read_array(h5, CLOUD_PATHS["fts2_2um"])
    fts2_tir = read_array(h5, CLOUD_PATHS["fts2_tir"])
    ch4_ratio = read_array(h5, CLOUD_PATHS["ch4_ratio"])
    co2_ratio = read_array(h5, CLOUD_PATHS["co2_ratio"])
    h2o_ratio = read_array(h5, CLOUD_PATHS["h2o_ratio"])
    pressure_delta = read_array(h5, CLOUD_PATHS["surface_pressure_delta"])
    cai2_cldd = read_array(h5, CLOUD_PATHS["cai2_cldd"])
    cai2_coherent = read_array(h5, CLOUD_PATHS["cai2_coherent"])

    rows = []
    for i, sounding in enumerate(soundings):
        rows.append(
            CloudInformation(
                sounding=sounding,
                fts2_2um_flag_1=clean_value(fts2_2um[i, 0]) if fts2_2um is not None and fts2_2um.ndim == 2 and fts2_2um.shape[1] > 0 else None,
                fts2_2um_flag_2=clean_value(fts2_2um[i, 1]) if fts2_2um is not None and fts2_2um.ndim == 2 and fts2_2um.shape[1] > 1 else None,
                fts2_tir_flag_1=clean_value(fts2_tir[i, 0]) if fts2_tir is not None and fts2_tir.ndim == 2 and fts2_tir.shape[1] > 0 else None,
                fts2_tir_flag_2=clean_value(fts2_tir[i, 1]) if fts2_tir is not None and fts2_tir.ndim == 2 and fts2_tir.shape[1] > 1 else None,
                fts2_tir_flag_3=clean_value(fts2_tir[i, 2]) if fts2_tir is not None and fts2_tir.ndim == 2 and fts2_tir.shape[1] > 2 else None,
                ch4_ratio=clean_value(ch4_ratio[i]) if ch4_ratio is not None else None,
                co2_ratio=clean_value(co2_ratio[i]) if co2_ratio is not None else None,
                h2o_ratio=clean_value(h2o_ratio[i]) if h2o_ratio is not None else None,
                surface_pressure_delta=clean_value(pressure_delta[i]) if pressure_delta is not None else None,
                cai2_cldd=array_to_json(cai2_cldd[i]) if cai2_cldd is not None else [],
                cai2_coherent=array_to_json(cai2_coherent[i]) if cai2_coherent is not None else [],
            )
        )
    return rows


def build_l1_quality_summary(soundings: List[Sounding], arrays: Dict[str, Optional[np.ndarray]]) -> List[L1QualitySummary]:
    rows = []
    for i, sounding in enumerate(soundings):
        rows.append(
            L1QualitySummary(
                sounding=sounding,
                sounding_quality_flag=arr_get(arrays, "sounding_quality_flag", i),
                scan_stability_flag=arr_get(arrays, "scan_stability_flag", i),
                imc_stability_flag=arr_get(arrays, "imc_stability_flag", i),
            )
        )
    return rows


def build_l1_quality_bands(soundings: List[Sounding], arrays: Dict[str, Optional[np.ndarray]]) -> List[L1QualityBand]:
    rows = []

    max_bands = 0
    for arr in arrays.values():
        if arr is not None and arr.ndim == 2:
            max_bands = max(max_bands, arr.shape[1])

    for i, sounding in enumerate(soundings):
        for b in range(max_bands):
            rows.append(
                L1QualityBand(
                    sounding=sounding,
                    band_index=b + 1,
                    snr=arr_get(arrays, "snr", i, b),
                    snr_synthesized=arr_get(arrays, "snr_synthesized", i, b),
                    interferogram_quality_flag=arr_get(arrays, "interferogram_quality_flag", i, b),
                    missing_flag=arr_get(arrays, "missing_flag", i, b),
                    saturation_flag=arr_get(arrays, "saturation_flag", i, b),
                    spectrum_quality_flag=arr_get(arrays, "spectrum_quality_flag", i, b),
                    spike_flag=arr_get(arrays, "spike_flag", i, b),
                    sensor_gain=arr_get(arrays, "sensor_gain", i, b),
                )
            )

    return rows


def build_profile_layers(h5: h5py.File, soundings: List[Sounding]) -> List[ProfileLayer]:
    arrays = load_arrays(h5, PROFILE_MAP)
    pressure_level = read_array(h5, PRESSURE_LEVEL_PATH)

    num_layers = 0
    for arr in arrays.values():
        if arr is not None and arr.ndim == 2:
            num_layers = max(num_layers, arr.shape[1])

    if num_layers == 0:
        return []

    rows = []
    for i, sounding in enumerate(soundings):
        for layer in range(num_layers):
            kwargs = {
                field: arr_get(arrays, field, i, layer)
                for field in PROFILE_MAP.keys()
            }

            pressure_upper = None
            pressure_lower = None
            if pressure_level is not None and pressure_level.ndim == 2:
                if pressure_level.shape[1] > layer:
                    pressure_upper = clean_value(pressure_level[i, layer])
                if pressure_level.shape[1] > layer + 1:
                    pressure_lower = clean_value(pressure_level[i, layer + 1])

            rows.append(
                ProfileLayer(
                    sounding=sounding,
                    layer_index=layer + 1,
                    pressure_upper=pressure_upper,
                    pressure_lower=pressure_lower,
                    **kwargs,
                )
            )

    return rows


def build_albedo_coefficients(h5: h5py.File, soundings: List[Sounding]) -> List[AlbedoCoefficient]:
    rows = []

    for subband_index, path in ALBEDO_SUBBANDS.items():
        albedo = read_array(h5, path)
        albedo_apriori = read_array(h5, ALBEDO_APRIORI_SUBBANDS[subband_index])
        albedo_uncert = read_array(h5, ALBEDO_UNCERT_SUBBANDS[subband_index])

        if albedo is None or albedo.ndim != 2:
            continue

        num_coeff = albedo.shape[1]
        for i, sounding in enumerate(soundings):
            for coeff in range(num_coeff):
                rows.append(
                    AlbedoCoefficient(
                        sounding=sounding,
                        subband_index=subband_index,
                        coefficient_index=coeff + 1,
                        albedo=clean_value(albedo[i, coeff]),
                        albedo_apriori=clean_value(albedo_apriori[i, coeff]) if albedo_apriori is not None else None,
                        albedo_uncert=clean_value(albedo_uncert[i, coeff]) if albedo_uncert is not None else None,
                    )
                )

    return rows


def build_retrieval_subband_parameters(h5: h5py.File, soundings: List[Sounding]) -> List[RetrievalSubbandParameter]:
    rows = []

    subband_arrays: Dict[int, Dict[str, Optional[np.ndarray]]] = {}
    for subband_index in range(1, 6):
        subband_arrays[subband_index] = {
            field: read_array(h5, template.format(subband_index))
            for field, template in SUBBAND_PARAM_PREFIXES.items()
        }

    for i, sounding in enumerate(soundings):
        for subband_index in range(1, 6):
            arrays = subband_arrays[subband_index]
            rows.append(
                RetrievalSubbandParameter(
                    sounding=sounding,
                    subband_index=subband_index,
                    residual_reduced_chi2=arr_get(arrays, "residual_reduced_chi2", i),
                    dispersion_adjustment=arr_get(arrays, "dispersion_adjustment", i),
                    dispersion_adjustment_apriori=arr_get(arrays, "dispersion_adjustment_apriori", i),
                    dispersion_adjustment_uncert=arr_get(arrays, "dispersion_adjustment_uncert", i),
                    ils_stretch_factor=arr_get(arrays, "ils_stretch_factor", i),
                    ils_stretch_factor_apriori=arr_get(arrays, "ils_stretch_factor_apriori", i),
                    ils_stretch_factor_uncert=arr_get(arrays, "ils_stretch_factor_uncert", i),
                    zero_level_offset=arr_get(arrays, "zero_level_offset", i),
                    zero_level_offset_apriori=arr_get(arrays, "zero_level_offset_apriori", i),
                    zero_level_offset_uncert=arr_get(arrays, "zero_level_offset_uncert", i),
                )
            )

    return rows


class Command(BaseCommand):
    help = "Import dữ liệu GOSAT-2 từ file .H5 vào GeoDjango/PostGIS database."

    def add_arguments(self, parser):
        parser.add_argument("h5_file", type=str, help="Đường dẫn file .H5/.h5 GOSAT-2")
        parser.add_argument("--batch-size", type=int, default=1000)
        parser.add_argument("--replace", action="store_true", help="Xóa product cũ có cùng file_id trước khi import")
        parser.add_argument("--skip-profiles", action="store_true", help="Không import profile_layer")
        parser.add_argument("--skip-albedo", action="store_true", help="Không import albedo_coefficient")
        parser.add_argument("--skip-subband", action="store_true", help="Không import retrieval_subband_parameter")
        parser.add_argument("--skip-catalog", action="store_true", help="Không lưu catalog cấu trúc H5")
        parser.add_argument("--dry-run", action="store_true", help="Chỉ kiểm tra file, không insert database")

    def handle(self, *args, **options):
        h5_file = options["h5_file"]
        batch_size = options["batch_size"]

        if not os.path.exists(h5_file):
            raise CommandError(f"Không tìm thấy file: {h5_file}")

        with h5py.File(h5_file, "r") as h5:
            n = get_num_soundings(h5)
            file_id = read_scalar(h5, "Metadata/fileID")

            self.stdout.write(self.style.NOTICE(f"File: {h5_file}"))
            self.stdout.write(self.style.NOTICE(f"file_id: {file_id}"))
            self.stdout.write(self.style.NOTICE(f"Số sounding: {n}"))

            if options["dry_run"]:
                self.stdout.write(self.style.SUCCESS("Dry-run OK. Không insert database."))
                return

            with transaction.atomic():
                if options["replace"] and file_id:
                    deleted, _ = GosatProduct.objects.filter(file_id=file_id).delete()
                    self.stdout.write(self.style.WARNING(f"Đã xóa product cũ: {deleted} object"))

                if file_id and GosatProduct.objects.filter(file_id=file_id).exists():
                    raise CommandError(
                        f"Product với file_id={file_id} đã tồn tại. "
                        "Dùng --replace nếu muốn import lại."
                    )

                product = build_product(h5, h5_file)
                self.stdout.write(self.style.SUCCESS(f"Đã tạo GosatProduct id={product.id}"))

                if not options["skip_catalog"]:
                    count = create_dataset_catalog(h5, product, batch_size)
                    self.stdout.write(self.style.SUCCESS(f"Đã lưu H5 catalog: {count} datasets"))

                sounding_arrays = load_arrays(h5, SOUNDING_MAP)
                sounding_rows = build_soundings(product, sounding_arrays, n)
                Sounding.objects.bulk_create(sounding_rows, batch_size=batch_size)
                soundings = fetch_soundings(product)
                self.stdout.write(self.style.SUCCESS(f"Đã import Sounding: {len(soundings)} rows"))

                retrieval_arrays = load_arrays(h5, RETRIEVAL_MAP)
                RetrievalResult.objects.bulk_create(
                    build_retrieval_results(soundings, retrieval_arrays),
                    batch_size=batch_size,
                )
                self.stdout.write(self.style.SUCCESS("Đã import RetrievalResult"))

                CloudInformation.objects.bulk_create(
                    build_cloud_information(h5, soundings),
                    batch_size=batch_size,
                )
                self.stdout.write(self.style.SUCCESS("Đã import CloudInformation"))

                l1_summary_arrays = load_arrays(h5, L1_SUMMARY_MAP)
                L1QualitySummary.objects.bulk_create(
                    build_l1_quality_summary(soundings, l1_summary_arrays),
                    batch_size=batch_size,
                )
                self.stdout.write(self.style.SUCCESS("Đã import L1QualitySummary"))

                l1_band_arrays = load_arrays(h5, L1_BAND_MAP)
                L1QualityBand.objects.bulk_create(
                    build_l1_quality_bands(soundings, l1_band_arrays),
                    batch_size=batch_size,
                )
                self.stdout.write(self.style.SUCCESS("Đã import L1QualityBand"))

                if not options["skip_profiles"]:
                    profile_rows = build_profile_layers(h5, soundings)
                    ProfileLayer.objects.bulk_create(profile_rows, batch_size=batch_size)
                    self.stdout.write(self.style.SUCCESS(f"Đã import ProfileLayer: {len(profile_rows)} rows"))

                if not options["skip_albedo"]:
                    albedo_rows = build_albedo_coefficients(h5, soundings)
                    AlbedoCoefficient.objects.bulk_create(albedo_rows, batch_size=batch_size)
                    self.stdout.write(self.style.SUCCESS(f"Đã import AlbedoCoefficient: {len(albedo_rows)} rows"))

                if not options["skip_subband"]:
                    subband_rows = build_retrieval_subband_parameters(h5, soundings)
                    RetrievalSubbandParameter.objects.bulk_create(subband_rows, batch_size=batch_size)
                    self.stdout.write(self.style.SUCCESS(f"Đã import RetrievalSubbandParameter: {len(subband_rows)} rows"))

            self.stdout.write(self.style.SUCCESS("Import GOSAT-2 H5 hoàn tất."))