import h5py
import numpy as np
import logging
from datetime import datetime, timezone
import os

logger = logging.getLogger(__name__)

class OCO2Parser:
    """
    Trình phân tích cú pháp dữ liệu OCO-2 từ định dạng .nc4 (HDF5).
    Trích xuất các phép đo XCO2 và hồ sơ thẳng đứng khí quyển.
    """
    
    # Gốc thời gian OCO-2: số giây tính từ 1993-01-01 00:00:00 UTC (TAI93)
    TAI93_EPOCH = datetime(1993, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    def parse(self, file_path, quality_only=True, bbox=None):
        """
        Phân tích tệp .nc4 và trả về dữ liệu có cấu trúc.
        :param file_path: Đường dẫn vật lý tới tệp tin.
        :param quality_only: Chỉ lấy các điểm đo có chất lượng tốt (flag=0).
        :param bbox: Giới hạn không gian [lat_min, lon_min, lat_max, lon_max].
        :return: Generator trả về từng điểm đo kèm theo profile.
        """
        logger.info(f"Bắt đầu phân tích tệp OCO-2: {file_path}")
        
        try:
            with h5py.File(file_path, "r") as f:
                # Đọc các tập dữ liệu cơ bản
                lat = f["latitude"][:]
                lon = f["longitude"][:]
                xco2 = f["xco2"][:]
                xco2_unc = f["xco2_uncertainty"][:]
                qflag = f["xco2_quality_flag"][:]
                time_arr = f["time"][:]
                date_arr = f["date"][:]
                
                # Các thông số bổ sung
                psurf = f["Retrieval/psurf"][:]
                sza = f["solar_zenith_angle"][:]
                vza = f["sensor_zenith_angle"][:]
                land_frac = f["Sounding/land_fraction"][:]
                
                # Dữ liệu hồ sơ thẳng đứng
                pressure_levels = f["pressure_levels"][:] # (N, 20)
                co2_apriori = f["co2_profile_apriori"][:] # (N, 20)
                ak = f["xco2_averaging_kernel"][:] # (N, 20)

                total_points = len(lat)
                count = 0

                for i in range(total_points):
                    # 1. Kiểm tra chất lượng
                    if quality_only and qflag[i] != 0:
                        continue
                        
                    # 2. Kiểm tra giới hạn không gian (Bounding Box)
                    if bbox:
                        if not (bbox[0] <= lat[i] <= bbox[2] and bbox[1] <= lon[i] <= bbox[3]):
                            continue
                            
                    # 3. Kiểm tra tính hợp lệ của giá trị XCO2
                    if not np.isfinite(xco2[i]) or xco2[i] <= 0:
                        continue

                    # Chuyển đổi thời gian
                    try:
                        dt = datetime(
                            int(date_arr[i, 0]), int(date_arr[i, 1]), int(date_arr[i, 2]),
                            int(date_arr[i, 3]), int(date_arr[i, 4]), int(date_arr[i, 5]),
                            int(date_arr[i, 6]) * 1000, tzinfo=timezone.utc
                        )
                    except:
                        # Fallback về TAI93 nếu mảng date lỗi
                        dt = datetime.fromtimestamp(self.TAI93_EPOCH.timestamp() + float(time_arr[i]), tz=timezone.utc)

                    # Cấu trúc dữ liệu cho một điểm đo (Measurement)
                    measurement_data = {
                        "latitude": float(lat[i]),
                        "longitude": float(lon[i]),
                        "xco2_ppm": float(xco2[i]),
                        "xco2_uncertainty_ppm": float(xco2_unc[i]) if np.isfinite(xco2_unc[i]) else None,
                        "xco2_quality_flag": int(qflag[i]),
                        "surface_pressure_hpa": float(psurf[i]) if np.isfinite(psurf[i]) else None,
                        "solar_zenith_angle_deg": float(sza[i]) if np.isfinite(sza[i]) else None,
                        "view_zenith_angle_deg": float(vza[i]) if np.isfinite(vza[i]) else None,
                        "land_fraction": float(land_frac[i]) if np.isfinite(land_frac[i]) else None,
                        "measurement_time": dt,
                        "data_source": "OCO2",
                    }

                    # Cấu trúc dữ liệu hồ sơ thẳng đứng (Vertical Profiles)
                    profiles = []
                    for lvl in range(pressure_levels.shape[1]):
                        profiles.append({
                            "level_index": lvl,
                            "pressure_hpa": float(pressure_levels[i, lvl]) if np.isfinite(pressure_levels[i, lvl]) else None,
                            "co2_concentration_ppm": float(co2_apriori[i, lvl]) if np.isfinite(co2_apriori[i, lvl]) else None,
                            "averaging_kernel": float(ak[i, lvl]) if np.isfinite(ak[i, lvl]) else None,
                        })

                    yield {
                        "measurement": measurement_data,
                        "profiles": profiles
                    }
                    count += 1

                logger.info(f"Hoàn thành phân tích OCO-2. Đã trích xuất {count}/{total_points} điểm đo.")

        except Exception as e:
            logger.error(f"Lỗi khi phân tích tệp OCO-2: {str(e)}")
            raise
