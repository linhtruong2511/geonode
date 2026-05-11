import logging
from ..models import QualityAssessment

logger = logging.getLogger(__name__)

class QualityService:
    """
    Dịch vụ đánh giá chất lượng dữ liệu CO2 dựa trên các tiêu chuẩn kỹ thuật khoa học.
    Thực hiện kiểm tra ngưỡng vật lý và logic cho từng phép đo.
    """

    def assess_measurement(self, measurement):
        """
        Thực hiện đánh giá toàn diện cho một điểm đo.
        :param measurement: Đối tượng Measurement (chưa hoặc đã lưu vào DB).
        :return: Đối tượng QualityAssessment chứa kết quả đánh giá.
        """
        flags = {}
        score = 100
        errors = []

        # 1. Kiểm tra nồng độ XCO2 (Dải thông thường: 350 - 450 ppm)
        xco2 = measurement.xco2_ppm
        if xco2 < 380 or xco2 > 430:
            flags["xco2_out_of_normal_range"] = True
            score -= 20
            if xco2 < 350 or xco2 > 500:
                flags["xco2_extreme_value"] = True
                score -= 30
                errors.append(f"XCO2 extreme value: {xco2}")

        # 2. Kiểm tra Áp suất bề mặt (Thường quanh mức 1013 hPa ở mực nước biển)
        psurf = measurement.surface_pressure_hpa
        if psurf:
            if psurf < 500 or psurf > 1100:
                flags["invalid_surface_pressure"] = True
                score -= 15
                errors.append(f"Invalid surface pressure: {psurf}")

        # 3. Kiểm tra Góc thiên đỉnh mặt trời (SZA)
        sza = measurement.solar_zenith_angle_deg
        if sza and sza > 75:
            # Dữ liệu vệ tinh kém chính xác khi mặt trời quá thấp
            flags["high_solar_zenith_angle"] = True
            score -= 10

        # 4. Kiểm tra Cờ chất lượng gốc từ vệ tinh
        if measurement.xco2_quality_flag != 0:
            flags["original_quality_flag_bad"] = True
            score -= 40
            errors.append("Original quality flag is non-zero")

        # Đảm bảo điểm số không âm
        score = max(0, score)

        # Tạo đối tượng QualityAssessment (không lưu vào DB ở đây để linh hoạt)
        assessment = QualityAssessment(
            measurement=measurement,
            quality_score=score,
            is_valid=(score >= 50), # Ngưỡng chấp nhận dữ liệu là 50/100
            validation_flags=flags,
            error_messages="; ".join(errors) if errors else None
        )
        
        return assessment
