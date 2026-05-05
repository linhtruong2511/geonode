from django.contrib.gis.db import models
from django.contrib.postgres.indexes import GistIndex
from django.db.models import Q

#OCO2 data
class OCO2Data(models.Model):
    sounding_id = models.BigIntegerField(unique=True, primary_key=True)
    acquisition_time = models.DateTimeField()
    xco2 = models.FloatField()
    location = models.PointField(srid=4326)
    file_path = models.CharField(max_length=500)

    class Meta:
        indexes = [
            models.Index(fields=["acquisition_time"], name="carbon_oco2_acq_idx"),
            GistIndex(fields=["location"], name="carbon_oco2_loc_gix"),
        ]
        ordering = ("-acquisition_time", "-sounding_id")

    def __str__(self):
        return f"{self.sounding_id} - {self.xco2:.2f} ppm"
    

class VietNamOCO2Data(models.Model):
    sounding_id = models.BigIntegerField(primary_key=True)

    acquisition_time = models.DateTimeField(db_index=True)

    xco2 = models.FloatField()
    xco2_uncertainty = models.FloatField(null=True, blank=True)
    xco2_quality_flag = models.IntegerField(null=True, blank=True)

    latitude = models.FloatField(db_index=True)
    longitude = models.FloatField(db_index=True)
    location = models.PointField(srid=4326)

    orbit = models.IntegerField(null=True, blank=True)
    operation_mode = models.CharField(max_length=50, null=True, blank=True)

    source_file = models.CharField(max_length=500, db_index=True)
    source_folder = models.CharField(max_length=500, db_index=True)

    raw_metadata = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "carbon_tracker_vietnam_oco2data"
        ordering = ("-acquisition_time", "-sounding_id")
        indexes = [
            GistIndex(fields=["location"], name="vn_oco2_location_gix"),
            models.Index(fields=["xco2_quality_flag"], name="vn_oco2_quality_idx"),
            models.Index(fields=["operation_mode"], name="vn_oco2_mode_idx"),
        ]

    def __str__(self):
        return f"{self.sounding_id} - {self.xco2:.2f} ppm"

#GOSAT2 data
class GosatProduct(models.Model):
    """Metadata cấp file/sản phẩm GOSAT-2 H5."""

    file_name = models.TextField()
    file_path = models.TextField(blank=True, null=True)
    file_id = models.TextField(blank=True, null=True, db_index=True)

    satellite_name = models.CharField(max_length=100, blank=True, null=True)
    sensor_name = models.CharField(max_length=100, blank=True, null=True)
    processing_level = models.CharField(max_length=100, blank=True, null=True)
    product_version = models.CharField(max_length=100, blank=True, null=True)
    algorithm_name = models.TextField(blank=True, null=True)
    algorithm_version = models.CharField(max_length=100, blank=True, null=True)
    input_data_version = models.CharField(max_length=100, blank=True, null=True)

    start_date = models.DateTimeField(blank=True, null=True, db_index=True)
    end_date = models.DateTimeField(blank=True, null=True, db_index=True)
    processing_date = models.DateTimeField(blank=True, null=True)
    processing_facility = models.TextField(blank=True, null=True)
    geodetic_datum = models.CharField(max_length=100, blank=True, null=True)

    num_sounding = models.IntegerField(blank=True, null=True)
    num_layer = models.IntegerField(blank=True, null=True)
    num_band = models.IntegerField(blank=True, null=True)

    metadata_json = models.JSONField(default=dict, blank=True)
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "gosat_product"
        indexes = [
            models.Index(fields=["file_id"]),
            models.Index(fields=["start_date", "end_date"]),
            models.Index(fields=["satellite_name", "sensor_name"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["file_id"],
                condition=~Q(file_id=None),
                name="uniq_gosat_product_file_id_not_null",
            )
        ]

    def __str__(self):
        return self.file_id or self.file_name


class Sounding(models.Model):
    """Một điểm quan trắc/sounding của GOSAT-2."""

    product = models.ForeignKey(
        GosatProduct,
        on_delete=models.CASCADE,
        related_name="soundings",
    )

    sounding_unique_id = models.CharField(max_length=64, blank=True, null=True)
    observation_request_id = models.CharField(max_length=128, blank=True, null=True)
    observation_time = models.DateTimeField(blank=True, null=True, db_index=True)

    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)
    height = models.FloatField(blank=True, null=True)

    geom = models.PointField(srid=4326, geography=False, blank=True, null=True)

    land_fraction = models.FloatField(blank=True, null=True)
    solar_zenith = models.FloatField(blank=True, null=True)
    solar_azimuth = models.FloatField(blank=True, null=True)
    view_zenith = models.FloatField(blank=True, null=True)
    view_azimuth = models.FloatField(blank=True, null=True)
    solar_distance = models.FloatField(blank=True, null=True)

    specular_view_vector_angle = models.FloatField(blank=True, null=True)
    surface_roughness = models.FloatField(blank=True, null=True)
    sunglint_flag = models.SmallIntegerField(blank=True, null=True)

    detailed_operation_mode = models.CharField(max_length=32, blank=True, null=True)
    scan_direction = models.CharField(max_length=32, blank=True, null=True)
    pointing_at = models.FloatField(blank=True, null=True)
    pointing_ct = models.FloatField(blank=True, null=True)
    ip_request = models.SmallIntegerField(blank=True, null=True)
    yaw_steering_flag = models.SmallIntegerField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "gosat_sounding"
        indexes = [
            models.Index(fields=["product"]),
            models.Index(fields=["observation_time"]),
            models.Index(fields=["latitude", "longitude"]),
            models.Index(fields=["sounding_unique_id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "sounding_unique_id"],
                condition=~Q(sounding_unique_id=None),
                name="uniq_gosat_sounding_per_product",
            )
        ]

    def __str__(self):
        return self.sounding_unique_id or f"Sounding {self.pk}"


class RetrievalResult(models.Model):
    """Kết quả truy hồi khí: XCO2, XCH4, XCO, XH2O."""

    sounding = models.OneToOneField(
        Sounding,
        on_delete=models.CASCADE,
        related_name="retrieval",
        primary_key=True,
    )

    xco2 = models.FloatField(blank=True, null=True, db_index=True)
    xco2_apriori = models.FloatField(blank=True, null=True)
    xco2_uncert = models.FloatField(blank=True, null=True)
    xco2_dfs = models.FloatField(blank=True, null=True)
    xco2_quality_flag = models.SmallIntegerField(blank=True, null=True, db_index=True)

    xch4 = models.FloatField(blank=True, null=True, db_index=True)
    xch4_apriori = models.FloatField(blank=True, null=True)
    xch4_uncert = models.FloatField(blank=True, null=True)
    xch4_dfs = models.FloatField(blank=True, null=True)
    xch4_quality_flag = models.SmallIntegerField(blank=True, null=True, db_index=True)

    xco = models.FloatField(blank=True, null=True, db_index=True)
    xco_apriori = models.FloatField(blank=True, null=True)
    xco_uncert = models.FloatField(blank=True, null=True)
    xco_dfs = models.FloatField(blank=True, null=True)
    xco_quality_flag = models.SmallIntegerField(blank=True, null=True, db_index=True)

    xh2o = models.FloatField(blank=True, null=True)
    xh2o_apriori = models.FloatField(blank=True, null=True)
    xh2o_uncert = models.FloatField(blank=True, null=True)
    xh2o_dfs = models.FloatField(blank=True, null=True)
    xh2o_quality_flag = models.SmallIntegerField(blank=True, null=True, db_index=True)

    dry_air_column = models.FloatField(blank=True, null=True)
    dry_air_column_apriori = models.FloatField(blank=True, null=True)

    surface_pressure = models.FloatField(blank=True, null=True)
    surface_pressure_apriori = models.FloatField(blank=True, null=True)
    surface_pressure_uncert = models.FloatField(blank=True, null=True)

    wind_speed = models.FloatField(blank=True, null=True)
    wind_speed_apriori = models.FloatField(blank=True, null=True)
    wind_speed_uncert = models.FloatField(blank=True, null=True)

    temperature_shift = models.FloatField(blank=True, null=True)
    temperature_shift_apriori = models.FloatField(blank=True, null=True)
    temperature_shift_uncert = models.FloatField(blank=True, null=True)

    fluorescence_at_reference = models.FloatField(blank=True, null=True)
    fluorescence_at_reference_apriori = models.FloatField(blank=True, null=True)
    fluorescence_at_reference_uncert = models.FloatField(blank=True, null=True)

    fluorescence_slope = models.FloatField(blank=True, null=True)
    fluorescence_slope_apriori = models.FloatField(blank=True, null=True)
    fluorescence_slope_uncert = models.FloatField(blank=True, null=True)

    iteration = models.IntegerField(blank=True, null=True)

    class Meta:
        db_table = "gosat_retrieval_result"
        indexes = [
            models.Index(fields=["xco2_quality_flag", "xch4_quality_flag"]),
            models.Index(fields=["xco_quality_flag", "xh2o_quality_flag"]),
            models.Index(fields=["xco2"]),
            models.Index(fields=["xch4"]),
            models.Index(fields=["xco"]),
        ]


class CloudInformation(models.Model):
    """Thông tin mây và các chỉ số hỗ trợ kiểm tra chất lượng retrieval."""

    sounding = models.OneToOneField(
        Sounding,
        on_delete=models.CASCADE,
        related_name="cloud",
        primary_key=True,
    )

    fts2_2um_flag_1 = models.SmallIntegerField(blank=True, null=True)
    fts2_2um_flag_2 = models.SmallIntegerField(blank=True, null=True)

    fts2_tir_flag_1 = models.SmallIntegerField(blank=True, null=True)
    fts2_tir_flag_2 = models.SmallIntegerField(blank=True, null=True)
    fts2_tir_flag_3 = models.SmallIntegerField(blank=True, null=True)

    ch4_ratio = models.FloatField(blank=True, null=True)
    co2_ratio = models.FloatField(blank=True, null=True)
    h2o_ratio = models.FloatField(blank=True, null=True)
    surface_pressure_delta = models.FloatField(blank=True, null=True)

    cai2_cldd = models.JSONField(default=list, blank=True)
    cai2_coherent = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "gosat_cloud_information"


class L1QualitySummary(models.Model):
    """Quality flag tổng quát cấp sounding."""

    sounding = models.OneToOneField(
        Sounding,
        on_delete=models.CASCADE,
        related_name="l1_quality_summary",
        primary_key=True,
    )

    sounding_quality_flag = models.CharField(max_length=32, blank=True, null=True)
    scan_stability_flag = models.SmallIntegerField(blank=True, null=True)
    imc_stability_flag = models.SmallIntegerField(blank=True, null=True)

    class Meta:
        db_table = "gosat_l1_quality_summary"
        indexes = [
            models.Index(fields=["sounding_quality_flag"]),
            models.Index(fields=["scan_stability_flag", "imc_stability_flag"]),
        ]


class L1QualityBand(models.Model):
    """Quality flag, SNR, sensor gain theo band."""

    sounding = models.ForeignKey(
        Sounding,
        on_delete=models.CASCADE,
        related_name="l1_quality_bands",
    )
    band_index = models.SmallIntegerField()

    snr = models.FloatField(blank=True, null=True)
    snr_synthesized = models.FloatField(blank=True, null=True)

    interferogram_quality_flag = models.SmallIntegerField(blank=True, null=True)
    missing_flag = models.SmallIntegerField(blank=True, null=True)
    saturation_flag = models.SmallIntegerField(blank=True, null=True)
    spectrum_quality_flag = models.SmallIntegerField(blank=True, null=True)
    spike_flag = models.SmallIntegerField(blank=True, null=True)
    sensor_gain = models.SmallIntegerField(blank=True, null=True)

    class Meta:
        db_table = "gosat_l1_quality_band"
        constraints = [
            models.UniqueConstraint(
                fields=["sounding", "band_index"],
                name="uniq_l1_quality_band_per_sounding",
            )
        ]
        indexes = [
            models.Index(fields=["band_index"]),
            models.Index(fields=["spectrum_quality_flag"]),
            models.Index(fields=["missing_flag", "saturation_flag", "spike_flag"]),
        ]


class ProfileLayer(models.Model):
    """Profile khí quyển theo 15 lớp."""

    sounding = models.ForeignKey(
        Sounding,
        on_delete=models.CASCADE,
        related_name="profile_layers",
    )
    layer_index = models.SmallIntegerField()

    pressure_upper = models.FloatField(blank=True, null=True)
    pressure_lower = models.FloatField(blank=True, null=True)
    pressure_weighting_function = models.FloatField(blank=True, null=True)

    co2_profile = models.FloatField(blank=True, null=True)
    co2_profile_apriori = models.FloatField(blank=True, null=True)
    co2_profile_uncert = models.FloatField(blank=True, null=True)

    ch4_profile = models.FloatField(blank=True, null=True)
    ch4_profile_apriori = models.FloatField(blank=True, null=True)
    ch4_profile_uncert = models.FloatField(blank=True, null=True)

    co_profile = models.FloatField(blank=True, null=True)
    co_profile_apriori = models.FloatField(blank=True, null=True)
    co_profile_uncert = models.FloatField(blank=True, null=True)

    h2o_profile = models.FloatField(blank=True, null=True)
    h2o_profile_apriori = models.FloatField(blank=True, null=True)
    h2o_profile_uncert = models.FloatField(blank=True, null=True)

    aerosol_profile_type1 = models.FloatField(blank=True, null=True)
    aerosol_profile_type1_apriori = models.FloatField(blank=True, null=True)
    aerosol_profile_type1_uncert = models.FloatField(blank=True, null=True)

    aerosol_profile_type2 = models.FloatField(blank=True, null=True)
    aerosol_profile_type2_apriori = models.FloatField(blank=True, null=True)
    aerosol_profile_type2_uncert = models.FloatField(blank=True, null=True)

    xco2_column_averaging_kernel = models.FloatField(blank=True, null=True)
    xch4_column_averaging_kernel = models.FloatField(blank=True, null=True)
    xco_column_averaging_kernel = models.FloatField(blank=True, null=True)
    xh2o_column_averaging_kernel = models.FloatField(blank=True, null=True)

    class Meta:
        db_table = "gosat_profile_layer"
        constraints = [
            models.UniqueConstraint(
                fields=["sounding", "layer_index"],
                name="uniq_profile_layer_per_sounding",
            )
        ]
        indexes = [
            models.Index(fields=["layer_index"]),
            models.Index(fields=["pressure_upper", "pressure_lower"]),
        ]


class AlbedoCoefficient(models.Model):
    """Hệ số albedo theo subband và coefficient index."""

    sounding = models.ForeignKey(
        Sounding,
        on_delete=models.CASCADE,
        related_name="albedo_coefficients",
    )
    subband_index = models.SmallIntegerField()
    coefficient_index = models.SmallIntegerField()

    albedo = models.FloatField(blank=True, null=True)
    albedo_apriori = models.FloatField(blank=True, null=True)
    albedo_uncert = models.FloatField(blank=True, null=True)

    class Meta:
        db_table = "gosat_albedo_coefficient"
        constraints = [
            models.UniqueConstraint(
                fields=["sounding", "subband_index", "coefficient_index"],
                name="uniq_albedo_coeff_per_sounding",
            )
        ]
        indexes = [
            models.Index(fields=["subband_index", "coefficient_index"]),
        ]


class RetrievalSubbandParameter(models.Model):
    """Các tham số retrieval theo subband."""

    sounding = models.ForeignKey(
        Sounding,
        on_delete=models.CASCADE,
        related_name="retrieval_subband_parameters",
    )
    subband_index = models.SmallIntegerField()

    residual_reduced_chi2 = models.FloatField(blank=True, null=True)

    dispersion_adjustment = models.FloatField(blank=True, null=True)
    dispersion_adjustment_apriori = models.FloatField(blank=True, null=True)
    dispersion_adjustment_uncert = models.FloatField(blank=True, null=True)

    ils_stretch_factor = models.FloatField(blank=True, null=True)
    ils_stretch_factor_apriori = models.FloatField(blank=True, null=True)
    ils_stretch_factor_uncert = models.FloatField(blank=True, null=True)

    zero_level_offset = models.FloatField(blank=True, null=True)
    zero_level_offset_apriori = models.FloatField(blank=True, null=True)
    zero_level_offset_uncert = models.FloatField(blank=True, null=True)

    class Meta:
        db_table = "gosat_retrieval_subband_parameter"
        constraints = [
            models.UniqueConstraint(
                fields=["sounding", "subband_index"],
                name="uniq_retrieval_subband_param_per_sounding",
            )
        ]
        indexes = [
            models.Index(fields=["subband_index"]),
            models.Index(fields=["residual_reduced_chi2"]),
        ]


class H5DatasetCatalog(models.Model):
    """Catalog lưu cấu trúc dataset gốc trong file H5."""

    product = models.ForeignKey(
        GosatProduct,
        on_delete=models.CASCADE,
        related_name="h5_datasets",
    )

    h5_path = models.TextField()
    dataset_name = models.TextField(blank=True, null=True)
    h5_group = models.TextField(blank=True, null=True)

    shape = models.TextField(blank=True, null=True)
    dtype = models.TextField(blank=True, null=True)

    description = models.TextField(blank=True, null=True)
    unit = models.CharField(max_length=100, blank=True, null=True)

    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "gosat_h5_dataset_catalog"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "h5_path"],
                name="uniq_h5_dataset_catalog_per_product",
            )
        ]
        indexes = [
            models.Index(fields=["h5_group"]),
            models.Index(fields=["dataset_name"]),
        ]