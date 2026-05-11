import logging
import hashlib
import os
from django.db import transaction
from django.contrib.gis.geos import Point
from .models import (
    Satellite, MeasurementSource, Measurement, 
    VerticalProfile, MeasurementMetadata, DataSourceType
)
from .oco2_parser import OCO2Parser
from .gosat2_parser import GOSAT2Parser
from .quality_service import QualityService

logger = logging.getLogger(__name__)

class ImportService:
    """
    Dịch vụ điều phối quá trình nhập dữ liệu CO2 từ tệp vệ tinh.
    Hỗ trợ OCO-2 (.nc4) và GOSAT-2 (.h5).
    """

    def compute_file_hash(self, file_path):
        """Tính mã băm SHA-256 để kiểm tra trùng lặp tệp."""
        sha = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha.update(chunk)
        return sha.hexdigest()

    def import_file(self, source_id, quality_only=True, bbox=None):
        """
        Thực hiện quy trình nhập dữ liệu cho một bản ghi MeasurementSource.
        """
        try:
            source = MeasurementSource.objects.get(pk=source_id)
        except MeasurementSource.DoesNotExist:
            logger.error(f"Không tìm thấy MeasurementSource id={source_id}")
            return False

        # 1. Xác định Parser phù hợp
        parser = None
        if source.file_format == 'NETCDF4':
            parser = OCO2Parser()
        elif source.file_format == 'HDF5':
            parser = GOSAT2Parser()
        else:
            logger.error(f"Định dạng tệp không hỗ trợ: {source.file_format}")
            return False

        file_path = source.file_name # Giả định file_name chứa đường dẫn đầy đủ hoặc tương đối
        if not os.path.exists(file_path):
             # Thử tìm trong thư mục media hoặc static nếu cần
             logger.error(f"Tệp không tồn tại: {file_path}")
             return False

        quality_service = QualityService()
        
        logger.info(f"Bắt đầu quy trình nhập liệu cho {source.file_name}")
        
        count = 0
        xco2_values = []
        all_locations = list(MonitoringLocation.objects.all()) # Lấy trước danh sách địa điểm để tối ưu

        # Sử dụng transaction để đảm bảo tính toàn vẹn dữ liệu
        with transaction.atomic():
            # Xóa các dữ liệu cũ nếu có (re-import)
            source.measurements.all().delete()

            for data in parser.parse(file_path, quality_only=quality_only, bbox=bbox):
                m_data = data["measurement"]
                p_data = data["profiles"]

                # Tạo đối tượng Measurement
                measurement = Measurement(
                    source=source,
                    geom=Point(m_data["longitude"], m_data["latitude"]),
                    latitude=m_data["latitude"],
                    longitude=m_data["longitude"],
                    xco2_ppm=m_data["xco2_ppm"],
                    xco2_uncertainty_ppm=m_data["xco2_uncertainty_ppm"],
                    xco2_quality_flag=m_data["xco2_quality_flag"],
                    surface_pressure_hpa=m_data["surface_pressure_hpa"],
                    solar_zenith_angle_deg=m_data["solar_zenith_angle_deg"],
                    view_zenith_angle_deg=m_data["view_zenith_angle_deg"],
                    cloud_flag=None,
                    land_fraction=m_data["land_fraction"],
                    data_source=m_data["data_source"],
                    measurement_time=m_data["measurement_time"]
                )
                measurement.save()
                
                # 4. Đánh giá chất lượng điểm đo
                assessment = quality_service.assess_measurement(measurement)
                assessment.save()

                # 5. Liên kết vào Chuỗi thời gian (TemporalSeries) của các vị trí giám sát
                # Kiểm tra điểm đo có nằm trong bán kính của địa điểm nào không
                from django.contrib.gis.measure import D
                from .models import TemporalSeries

                for loc in all_locations:
                    # Tính khoảng cách đơn giản (tính toán bằng mét cho SRID 4326)
                    # Lưu ý: loc.geom.distance(measurement.geom) trả về độ. 
                    # Chúng ta dùng distance_lte trong queryset hoặc tính toán gần đúng ở đây.
                    # Để đơn giản và nhanh trong vòng lặp, ta dùng bộ lọc không gian SQL nếu cần,
                    # nhưng vì list all_locations nhỏ, ta có thể so sánh trực tiếp.
                    
                    # Cách chính xác nhất là dùng ST_Distance_Sphere hoặc tương đương
                    # Ở đây ta sử dụng một logic đơn giản: nếu điểm này nằm trong vùng giám sát, lưu vào chuỗi thời gian
                    if measurement.geom.distance(loc.geom) * 111.32 <= loc.radius_km: # 1 độ ~ 111.32 km
                        TemporalSeries.objects.create(
                            location=loc,
                            measurement=measurement,
                            measurement_date=measurement.measurement_time.date(),
                            xco2_ppm=measurement.xco2_ppm,
                            data_source=measurement.data_source
                        )
                
                # Lưu giá trị XCO2 để tính toán metadata sau này
                xco2_values.append(m_data["xco2_ppm"])

                # Tạo các đối tượng VerticalProfile
                profile_objs = []
                for p in p_data:
                    profile_objs.append(VerticalProfile(
                        measurement=measurement,
                        level_index=p["level_index"],
                        pressure_hpa=p["pressure_hpa"],
                        co2_concentration_ppm=p["co2_concentration_ppm"],
                        co2_uncertainty_ppm=p.get("co2_uncertainty_ppm"),
                        temperature_k=p.get("temperature_k"),
                        averaging_kernel=p.get("averaging_kernel")
                    ))
                VerticalProfile.objects.bulk_create(profile_objs)

                count += 1
                if count % 1000 == 0:
                    logger.info(f"Đã nhập {count} điểm đo...")

            # 2. Cập nhật Metadata cho Source
            if xco2_values:
                import numpy as np
                source.total_soundings = count
                source.quality_checked = True
                source.save()

                MeasurementMetadata.objects.update_or_create(
                    source=source,
                    defaults={
                        "min_xco2": min(xco2_values),
                        "max_xco2": max(xco2_values),
                        "mean_xco2": sum(xco2_values) / len(xco2_values),
                        "coverage_stats": {"count": count}
                    }
                )

        logger.info(f"✅ Hoàn thành nhập liệu: {count} bản ghi.")
        return True
