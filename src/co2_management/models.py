from django.contrib.gis.db import models
from django.conf import settings

# Lựa chọn loại nguồn dữ liệu vệ tinh
class DataSourceType(models.TextChoices):
    OCO2 = 'OCO2', 'OCO-2'
    GOSAT2 = 'GOSAT2', 'GOSAT-2'

# Lựa chọn định dạng tệp dữ liệu đầu vào
class FileFormatType(models.TextChoices):
    NETCDF4 = 'NETCDF4', 'netCDF4'
    HDF5 = 'HDF5', 'HDF5'

# Phân loại loại hình khu vực giám sát
class LocationType(models.TextChoices):
    CITY = 'CITY', 'City'
    REGION = 'REGION', 'Region'
    INDUSTRIAL = 'INDUSTRIAL', 'Industrial Area'
    RESEARCH = 'RESEARCH', 'Research Station'

# Các loại tác vụ phân tích hệ thống hỗ trợ
class JobType(models.TextChoices):
    COMPARISON = 'COMPARISON', 'Comparison'
    TREND = 'TREND', 'Trend Analysis'
    ANOMALY = 'ANOMALY', 'Anomaly Detection'
    EXPORT = 'EXPORT', 'Data Export'

# Trạng thái của một tiến trình xử lý/phân tích
class JobStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    RUNNING = 'RUNNING', 'Running'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'

# Phương pháp so sánh dữ liệu giữa các nguồn
class ComparisonType(models.TextChoices):
    SPATIAL = 'SPATIAL', 'Spatial'
    TEMPORAL = 'TEMPORAL', 'Temporal'
    RANDOM = 'RANDOM', 'Random'

# Các hành động được ghi nhận trong nhật ký hệ thống
class AuditAction(models.TextChoices):
    INSERT = 'INSERT', 'Insert'
    UPDATE = 'UPDATE', 'Update'
    DELETE = 'DELETE', 'Delete'
    QUERY = 'QUERY', 'Query'


class Satellite(models.Model):
    """
    Thông tin chi tiết về các vệ tinh quan trắc CO2.
    """
    satellite_name = models.CharField(max_length=50) # Tên vệ tinh (ví dụ: OCO-2, GOSAT-2)
    launch_date = models.DateField(null=True, blank=True) # Ngày phóng vệ tinh
    operator = models.CharField(max_length=100) # Cơ quan/tổ chức vận hành
    orbital_altitude_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Độ cao quỹ đạo (km)
    orbital_period_minutes = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Chu kỳ quỹ đạo (phút)
    orbital_inclination_deg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Độ nghiêng quỹ đạo (độ)
    is_active = models.BooleanField(default=True) # Trạng thái hoạt động

    def __str__(self):
        return self.satellite_name


class SatelliteInstrument(models.Model):
    """
    Các thiết bị/công cụ đo đạc được gắn trên vệ tinh.
    """
    satellite = models.ForeignKey(Satellite, on_delete=models.CASCADE, related_name='instruments') # Liên kết tới vệ tinh
    instrument_name = models.CharField(max_length=50) # Tên thiết bị (ví dụ: TANSO-FTS-2)
    spectral_bands = models.IntegerField(null=True, blank=True) # Số lượng dải phổ
    spectral_range_min_nm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Bước sóng tối thiểu (nm)
    spectral_range_max_nm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Bước sóng tối đa (nm)
    spatial_resolution_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Độ phân giải không gian (km)

    def __str__(self):
        return f"{self.satellite.satellite_name} - {self.instrument_name}"


class MeasurementSource(models.Model):
    """
    Quản lý các tệp dữ liệu đo đạc thô được nhập vào hệ thống.
    """
    satellite = models.ForeignKey(Satellite, on_delete=models.CASCADE, related_name='sources') # Vệ tinh nguồn
    file_name = models.CharField(max_length=255) # Tên tệp dữ liệu
    file_format = models.CharField(max_length=10, choices=FileFormatType.choices) # Định dạng tệp
    file_size_mb = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True) # Dung lượng tệp (MB)
    measurement_date = models.DateField(null=True, blank=True) # Ngày thực hiện phép đo
    total_soundings = models.IntegerField(null=True, blank=True) # Tổng số điểm đo (soundings) trong tệp
    quality_checked = models.BooleanField(default=False) # Đã qua kiểm định chất lượng chưa
    processing_level = models.CharField(max_length=20, null=True, blank=True) # Cấp độ xử lý dữ liệu (ví dụ: L2)
    algorithm_version = models.CharField(max_length=50, null=True, blank=True) # Phiên bản thuật toán xử lý
    file_hash = models.CharField(max_length=64, unique=True, help_text="SHA-256 hash to prevent duplicates") # Mã băm kiểm tra trùng lặp

    def __str__(self):
        return self.file_name


class MeasurementMetadata(models.Model):
    """
    Thông tin thống kê tổng hợp từ một nguồn dữ liệu đo đạc.
    """
    source = models.OneToOneField(MeasurementSource, on_delete=models.CASCADE, related_name='metadata') # Liên kết tới nguồn dữ liệu
    min_xco2 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Giá trị XCO2 nhỏ nhất
    max_xco2 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Giá trị XCO2 lớn nhất
    mean_xco2 = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True) # Giá trị XCO2 trung bình
    coverage_stats = models.JSONField(null=True, blank=True) # Thống kê phạm vi bao phủ (dạng JSON)

    def __str__(self):
        return f"Metadata for {self.source.file_name}"

class Measurement(models.Model):
    """
    Dữ liệu đo đạc chi tiết cho từng điểm (sounding).
    """
    id = models.BigAutoField(primary_key=True)
    source = models.ForeignKey(MeasurementSource, on_delete=models.CASCADE, related_name='measurements') # Tệp nguồn chứa điểm đo này
    geom = models.PointField(srid=4326) # Dữ liệu không gian (tọa độ điểm)
    latitude = models.FloatField() # Vĩ độ
    longitude = models.FloatField() # Kinh độ
    xco2_ppm = models.FloatField() # Nồng độ XCO2 (phần triệu - ppm)
    xco2_uncertainty_ppm = models.FloatField(null=True, blank=True) # Độ không đảm bảo của XCO2
    xco2_quality_flag = models.IntegerField(default=0) # Cờ chất lượng (0: tốt, 1: kém)
    surface_pressure_hpa = models.FloatField(null=True, blank=True) # Áp suất bề mặt (hPa)
    solar_zenith_angle_deg = models.FloatField(null=True, blank=True) # Góc thiên đỉnh mặt trời (độ)
    view_zenith_angle_deg = models.FloatField(null=True, blank=True) # Góc thiên đỉnh quan sát (độ)
    cloud_flag = models.IntegerField(null=True, blank=True) # Cờ mây (phát hiện mây)
    land_fraction = models.FloatField(null=True, blank=True) # Tỷ lệ diện tích đất liền
    data_source = models.CharField(max_length=10, choices=DataSourceType.choices) # Nguồn loại dữ liệu (OCO2/GOSAT2)
    measurement_time = models.DateTimeField() # Thời gian thực hiện phép đo
    deleted_at = models.DateTimeField(null=True, blank=True) # Thời điểm xóa (xóa mềm)

    class Meta:
        indexes = [
            models.Index(fields=['source', 'measurement_time']),
            models.Index(fields=['data_source', 'xco2_quality_flag', 'xco2_ppm']),
        ]

    def __str__(self):
        return f"Measurement {self.id} ({self.data_source})"


class VerticalProfile(models.Model):
    """
    Dữ liệu hồ sơ thẳng đứng của nồng độ CO2 tại một điểm đo.
    """
    id = models.BigAutoField(primary_key=True)
    measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE, related_name='profiles') # Liên kết tới điểm đo mặt phẳng
    level_index = models.IntegerField() # Chỉ số tầng khí quyển
    pressure_hpa = models.FloatField(null=True, blank=True) # Áp suất tại tầng này (hPa)
    co2_concentration_ppm = models.FloatField(null=True, blank=True) # Nồng độ CO2 tại tầng này (ppm)
    co2_uncertainty_ppm = models.FloatField(null=True, blank=True) # Độ không đảm bảo nồng độ CO2
    temperature_k = models.FloatField(null=True, blank=True) # Nhiệt độ tại tầng này (Kelvin)
    averaging_kernel = models.FloatField(null=True, blank=True) # Giá trị Averaging Kernel

    def __str__(self):
        return f"Profile {self.id} for Measurement {self.measurement_id}"


class QualityAssessment(models.Model):
    """
    Kết quả đánh giá chất lượng chi tiết cho từng điểm đo.
    """
    measurement = models.OneToOneField(Measurement, on_delete=models.CASCADE, related_name='quality') # Điểm đo được đánh giá
    quality_score = models.IntegerField(help_text="0-100") # Điểm chất lượng (0-100)
    is_valid = models.BooleanField(default=True) # Trạng thái hợp lệ
    validation_flags = models.JSONField(default=dict) # Các cờ kiểm định chi tiết
    error_messages = models.TextField(null=True, blank=True) # Thông báo lỗi nếu có

    def __str__(self):
        return f"Quality for Measurement {self.measurement_id}"


class MonitoringLocation(models.Model):
    """
    Các vị trí địa lý cụ thể cần giám sát nồng độ CO2 thường xuyên.
    """
    location_name = models.CharField(max_length=255) # Tên địa điểm
    location_type = models.CharField(max_length=20, choices=LocationType.choices) # Phân loại địa điểm
    geom = models.PointField(srid=4326) # Tọa độ tâm địa điểm
    latitude = models.FloatField() # Vĩ độ tâm
    longitude = models.FloatField() # Kinh độ tâm
    radius_km = models.FloatField() # Bán kính vùng giám sát (km)

    def __str__(self):
        return self.location_name


class TemporalSeries(models.Model):
    """
    Dữ liệu chuỗi thời gian nồng độ CO2 tại các địa điểm giám sát.
    """
    id = models.BigAutoField(primary_key=True)
    location = models.ForeignKey(MonitoringLocation, on_delete=models.CASCADE, related_name='series') # Liên kết tới địa điểm
    measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE) # Phép đo cụ thể trong chuỗi
    measurement_date = models.DateField() # Ngày đo
    xco2_ppm = models.FloatField() # Giá trị XCO2 tại thời điểm đó
    data_source = models.CharField(max_length=10, choices=DataSourceType.choices) # Nguồn dữ liệu

    def __str__(self):
        return f"Series {self.id} for {self.location.location_name}"

class AnalysisJob(models.Model):
    """
    Quản lý các yêu cầu phân tích dữ liệu bất đồng bộ.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='co2_analysis_jobs') # Người dùng yêu cầu
    job_name = models.CharField(max_length=255) # Tên công việc
    job_type = models.CharField(max_length=20, choices=JobType.choices) # Loại phân tích
    sources = models.ManyToManyField(MeasurementSource, related_name='analysis_jobs', blank=True) # Các nguồn dữ liệu đầu vào
    parameters = models.JSONField(default=dict) # Các tham số phân tích
    status = models.CharField(max_length=20, choices=JobStatus.choices, default=JobStatus.PENDING) # Trạng thái hiện tại
    progress_percent = models.IntegerField(default=0) # Tiến độ thực hiện (%)
    result_path = models.CharField(max_length=500, null=True, blank=True) # Đường dẫn lưu trữ kết quả

    def __str__(self):
        return self.job_name

class DataComparison(models.Model):
    """
    Lưu trữ kết quả so sánh giữa hai điểm đo từ các nguồn khác nhau (ví dụ: OCO-2 đối chiếu với GOSAT-2).
    """
    job = models.ForeignKey(AnalysisJob, on_delete=models.CASCADE, related_name='comparisons', null=True, blank=True) # Phiên phân tích tạo ra kết quả này
    oco2_measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE, related_name='oco2_comparisons') # Điểm đo từ OCO-2
    gosat2_measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE, related_name='gosat2_comparisons') # Điểm đo từ GOSAT-2
    spatial_distance_km = models.FloatField() # Khoảng cách không gian giữa hai điểm (km)
    xco2_difference_ppm = models.FloatField() # Chênh lệch nồng độ XCO2 (ppm)
    comparison_type = models.CharField(max_length=10, choices=ComparisonType.choices) # Phương pháp so sánh

    def __str__(self):
        return f"Comparison {self.id} (Diff: {self.xco2_difference_ppm} ppm)"


class AuditLog(models.Model):
    """
    Nhật ký hệ thống theo dõi các thay đổi dữ liệu trong mô-đun CO2.
    """
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='co2_audit_logs') # Người thực hiện
    action = models.CharField(max_length=10, choices=AuditAction.choices) # Loại hành động
    table_name = models.CharField(max_length=100) # Tên bảng bị tác động
    old_value = models.JSONField(null=True, blank=True) # Giá trị trước khi thay đổi
    new_value = models.JSONField(null=True, blank=True) # Giá trị sau khi thay đổi
    created_at = models.DateTimeField(auto_now_add=True) # Thời điểm ghi nhật ký

    def __str__(self):
        return f"Log {self.id} - {self.action} on {self.table_name}"
