import h5py
import numpy as np
import logging
from datetime import datetime, timezone
import os

logger = logging.getLogger(__name__)

class GOSAT2Parser:
    """
    Trình phân tích cú pháp dữ liệu GOSAT-2 từ định dạng .h5 (HDF5).
    Trích xuất các phép đo XCO2 và hồ sơ thẳng đứng khí quyển từ cấu trúc phân cấp.
    """

    def parse_time(self, obs_time_bytes) -> datetime | None:
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

    def parse(self, file_path, quality_only=True, bbox=None):
        """
        Phân tích tệp .h5 và trích xuất dữ liệu đo đạc nồng độ khí nhà kính.
        :param file_path: Đường dẫn vật lý tới tệp tin.
        :param quality_only: Chỉ lấy các điểm đo có chất lượng tốt (flag=0).
        :param bbox: Giới hạn không gian [lat_min, lon_min, lat_max, lon_max].
        :return: Generator trả về từng điểm đo kèm theo profile.
        """
        logger.info(f"Bắt đầu phân tích tệp GOSAT-2: {file_path}")

        try:
            with h5py.File(file_path, "r") as f:
                # Đọc các tập dữ liệu từ cấu trúc cây HDF5
                lat = f["SoundingGeometry/latitude"][:]
                lon = f["SoundingGeometry/longitude"][:]
                xco2 = f["RetrievalResult/xco2"][:]
                xco2_unc = f["RetrievalResult/xco2_uncert"][:]
                qflag = f["RetrievalResult/xco2_quality_flag"][:]
                obs_time = f["SoundingAttribute/observationTime"][:]
                
                # Các thông số bổ sung
                surface_p = f["RetrievalResult/surface_pressure"][:]
                solar_zen = f["SoundingGeometry/solarZenith"][:]
                view_zen = f["SoundingGeometry/viewZenith"][:]
                land_frac = f["SoundingGeometry/landFraction"][:]
                
                # Dữ liệu hồ sơ thẳng đứng (GOSAT-2 có 16 ranh giới áp suất cho 15 tầng)
                pressure_levels = f["RetrievalResult/pressure_level"][:]       # (N, 16)
                co2_profile = f["RetrievalResult/co2_profile"][:]              # (N, 15)
                co2_profile_unc = f["RetrievalResult/co2_profile_uncert"][:]   # (N, 15)
                ak = f["RetrievalResult/xco2_column_averaging_kernel"][:]      # (N, 15)

                total_points = len(lat)
                count = 0

                for i in range(total_points):
                    # 1. Kiểm tra chất lượng
                    if quality_only and qflag[i] != 0:
                        continue

                    # 2. Kiểm tra giới hạn không gian
                    if bbox:
                        if not (bbox[0] <= lat[i] <= bbox[2] and bbox[1] <= lon[i] <= bbox[3]):
                            continue

                    # 3. Kiểm tra tính hợp lệ của XCO2
                    val_xco2 = float(xco2[i])
                    if not np.isfinite(val_xco2) or val_xco2 <= 0:
                        continue

                    # Chuyển đổi thời gian
                    dt = self.parse_time(obs_time[i])
                    if not dt:
                        continue

                    # Cấu trúc dữ liệu cho một điểm đo
                    measurement_data = {
                        "latitude": float(lat[i]),
                        "longitude": float(lon[i]),
                        "xco2_ppm": val_xco2,
                        "xco2_uncertainty_ppm": float(xco2_unc[i]) if np.isfinite(float(xco2_unc[i])) else None,
                        "xco2_quality_flag": int(qflag[i]),
                        "surface_pressure_hpa": float(surface_p[i]) if np.isfinite(float(surface_p[i])) else None,
                        "solar_zenith_angle_deg": float(solar_zen[i]) if np.isfinite(float(solar_zen[i])) else None,
                        "view_zenith_angle_deg": float(view_zen[i]) if np.isfinite(float(view_zen[i])) else None,
                        "land_fraction": float(land_frac[i]) if np.isfinite(float(land_frac[i])) else None,
                        "measurement_time": dt,
                        "data_source": "GOSAT2",
                    }

                    # Cấu trúc dữ liệu hồ sơ thẳng đứng
                    profiles = []
                    n_levels = co2_profile.shape[1] # Thường là 15 tầng
                    p_bounds = pressure_levels[i]   # 16 ranh giới áp suất
                    
                    for lvl in range(n_levels):
                        # Tính áp suất trung bình của tầng từ hai ranh giới
                        p_mid = (float(p_bounds[lvl]) + float(p_bounds[lvl + 1])) / 2.0
                        
                        profiles.append({
                            "level_index": lvl,
                            "pressure_hpa": p_mid if np.isfinite(p_mid) else None,
                            "co2_concentration_ppm": float(co2_profile[i, lvl]) if np.isfinite(co2_profile[i, lvl]) else None,
                            "co2_uncertainty_ppm": float(co2_profile_unc[i, lvl]) if np.isfinite(co2_profile_unc[i, lvl]) else None,
                            "averaging_kernel": float(ak[i, lvl]) if np.isfinite(ak[i, lvl]) else None,
                        })

                    yield {
                        "measurement": measurement_data,
                        "profiles": profiles
                    }
                    count += 1

                logger.info(f"Hoàn thành phân tích GOSAT-2. Đã trích xuất {count}/{total_points} điểm đo.")

        except Exception as e:
            logger.error(f"Lỗi khi phân tích tệp GOSAT-2: {str(e)}")
            raise
