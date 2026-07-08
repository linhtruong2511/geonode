# Hướng dẫn cấu hình ImageMosaic & Khắc phục lỗi (Troubleshooting) - ERA5 Wind

Tài liệu này ghi lại chi tiết các bước cấu hình ImageMosaic phục vụ dữ liệu lưới gió ERA5 gridded, liên kết với cơ sở dữ liệu Postgres (Django) và các lỗi thường gặp trong quá trình triển khai thực tế trên môi trường Docker Compose.

---

## 1. Cấu hình các file Properties (`/data/winds/era5_mosaic/`)

Để ImageMosaic liên kết trực tiếp với bảng chỉ mục của Django (`wind_raster_granules_index`), ta sử dụng 3 file cấu hình đặt trong thư mục chứa dữ liệu:

### `datastore.properties`
Cấu hình kết nối cơ sở dữ liệu PostGIS.
```properties
SPI=org.geotools.data.postgis.PostgisNGDataStoreFactory
host=db # Sử dụng host 'db' của container Postgres trong docker network
port=5432
database=project # CSDL của Django chứa bảng wind_raster_granules_index
schema=public
user=project
passwd=OX8IKyxiX4kZXNY
Loose\ bounding\ box=true
Estimated\ extends=false
Validate\ connections=true
Connection\ timeout=10
Prepared\ statements=true
useExistingSchema=true # Bắt buộc đặt ở đây để thông báo cho PostGIS Datastore không tự động chạy CREATE TABLE
```

### `indexer.properties`
Định nghĩa ánh xạ (mapping) giữa file raster NetCDF với bảng chỉ mục trong Database.
```properties
# Tên bảng lưu index trong Postgres (Trùng với db_table trong Meta của Django)
TypeName=wind_raster_granules_index

# Sử dụng bảng đã có trong cơ sở dữ liệu thay vì cố gắng tự tạo bảng mới
useExistingSchema=true

# Khai báo Schema chi tiết khớp chính xác với cấu trúc bảng Django trong Postgres
# Rất quan trọng khi bảng Django chứa các trường ngoài lề (như id, variable_code, dataset_id, elevation)
Schema=footprint:Polygon,file_location:String,granule_time:java.util.Date,elevation:Double,variable_code:String,dataset_id:Integer

# Trường chứa đường dẫn file vật lý
LocationAttribute=file_location

# Trường chứa tọa độ không gian
GeomAttribute=footprint

# Định nghĩa các chiều dữ liệu bổ sung (Chiều thời gian)
PropertyModifiers=org.geotools.image.io.WMSLayerPropertyModifier

# Map chiều thời gian của GeoServer vào cột granule_time của Django
TimeAttribute=granule_time

# Báo cho GeoServer biết đây là dạng dữ liệu NetCDF đa chiều
CanBeCurvilinear=false
Caching=false
```

### `timeregex.properties`
Regex để bóc tách mốc thời gian từ tên tệp tin và lưu vào cột `granule_time`.
```properties
regex=[0-9]{8}[0-9]{2}
```

---

## 2. Các lỗi thường gặp & Cách khắc phục (Troubleshooting)

### Lỗi 1: `Could not find file: file:///data/winds/era5_mosaic/`
* **Triệu chứng:** Khi điền Connection Parameter trong GeoServer Admin bị báo lỗi không tìm thấy đường dẫn.
* **Nguyên nhân:** Container `geoserver` chưa được mount thư mục vật lý `D:/Data/Winds` từ máy chủ (host). Mặc dù container `django` đã có mount này, nhưng `geoserver` là một container độc lập.
* **Cách sửa:** Sửa file `docker-compose.yml`, thêm dòng volume mount vào dưới service `geoserver`:
  ```yaml
    geoserver:
      volumes:
        ...
        - 'D:/Data/Winds:/data/winds'
  ```
  Sau đó khởi động lại container: `docker-compose up -d --force-recreate geoserver`.

---

### Lỗi 2: `Failed to create reader from file:///data/winds/era5_mosaic` (Thiếu Plugin NetCDF)
* **Triệu chứng:** Không thể kết nối GeoServer với nguồn dữ liệu NetCDF.
* **Nguyên nhân:** GeoServer mặc định không hỗ trợ định dạng NetCDF (`.nc`), cần phải cài thêm extension `geoserver-netcdf-plugin`.
* **Cách sửa:** Tải plugin NetCDF tương thích với phiên bản GeoServer (ví dụ: `2.27.3`), giải nén các file `.jar` (`gs-netcdf-*.jar`, `netcdf4-*.jar`, `gt-netcdf-*.jar`) rồi sao chép vào thư mục `/usr/local/tomcat/webapps/geoserver/WEB-INF/lib/` của container `geoserver`. Khởi động lại container.

---

### Lỗi 3: `Nc4Iosp: NetCDF-4 C library not present` / `Unable to load library 'netcdf'`
* **Triệu chứng:** GeoServer nhận diện được định dạng NetCDF nhưng báo lỗi thiếu thư viện C liên kết (`libnetcdf.so`).
* **Nguyên nhân:** File NetCDF lưu ở định dạng **NetCDF-4** (dạng nén HDF5). Định dạng này yêu cầu GeoServer gọi thư viện C của Linux thông qua JNA. Do trong container GeoServer không cài đặt thư viện này nên tiến trình giải mã bị crash.
* **Cách sửa:**
  1. Chuyển đổi định dạng file NetCDF từ NetCDF-4 sang **`NETCDF3_CLASSIC`** (NetCDF-3 cổ điển). Bộ thư viện Java thuần (Pure Java) của GeoServer có thể đọc tốt định dạng NetCDF-3 mà không cần thư viện C.
  2. Sử dụng Python `xarray` để chuyển đổi:
     ```python
     import xarray as xr
     ds = xr.open_dataset('input.nc')
     ds.to_netcdf('output.nc', format='NETCDF3_CLASSIC')
     ```

---

### Lỗi 4: Lỗi tọa độ vĩ độ ngược (Descending Latitude)
* **Triệu chứng:** GeoServer báo lỗi không đọc được Native Bounds hoặc không tạo được Reader.
* **Nguyên nhân:** Trục vĩ độ (`lat`) của file ERA5 gốc xếp theo thứ tự giảm dần (ví dụ: từ `22.0` xuống `17.0`). GeoServer yêu cầu trục vĩ độ bắt buộc phải xếp theo thứ tự **tăng dần** (từ Nam lên Bắc, ví dụ từ `17.0` lên `22.0`).
* **Cách sửa:** Sử dụng Python `xarray` đảo ngược trục vĩ độ trước khi đưa vào GeoServer:
  ```python
  import xarray as xr
  ds = xr.open_dataset('input.nc')
  ds = ds.reindex(lat=list(reversed(ds.lat)))
  ds.to_netcdf('output.nc', format='NETCDF3_CLASSIC')
  ```

---

### Lỗi 5: `Schema 'wind_raster_granules_index' already exists`
* **Triệu chứng:** GeoServer báo lỗi bảng chỉ mục đã tồn tại trong Postgres và dừng tiến trình.
* **Nguyên nhân:** GeoServer mặc định cố gắng chạy câu lệnh `CREATE TABLE` để tạo bảng lưu trữ chỉ mục. Do Django đã tạo bảng này trước thông qua migration, Postgres báo lỗi trùng lặp.
* **Cách sửa:** Thêm tham số kết nối **`useExistingSchema=true`** vào tệp **`datastore.properties`** (Bắt buộc phải đặt ở file này thay vì `indexer.properties` để PostGIS Datastore nhận diện).

---

### Lỗi 6: `Invalid mosaic schema ... extends Feature(wind_raster_granules_index...)`
* **Triệu chứng:** GeoServer báo lỗi schema của biến (ví dụ: `u100m`) kế thừa từ bảng chỉ mục không hợp lệ, báo thiếu trường hình học (`footprint`) hoặc đường dẫn tệp tin (`file_location`).
* **Nguyên nhân:** Bảng chỉ mục của Django có nhiều trường bổ sung ngoài luồng (`id`, `variable_code`, `dataset_id`...) khiến GeoServer không tự động map được các trường của file raster vào bảng dữ liệu.
* **Cách sửa:** Thêm cấu hình thuộc tính **`Schema`** chi tiết vào tệp **`indexer.properties`** để khai báo rõ cấu trúc kiểu dữ liệu của các trường trong CSDL:
  ```properties
  Schema=footprint:Polygon,file_location:String,granule_time:java.util.Date,elevation:Double,variable_code:String,dataset_id:Integer
  ```

---

### Lỗi 7: Không cập nhật được dữ liệu mới sau khi sửa đổi file
* **Triệu chứng:** Sau khi cập nhật file NetCDF chuẩn hóa (đã lật trục lat hoặc đổi định dạng), GeoServer vẫn báo lỗi cũ.
* **Nguyên nhân:** GeoServer tự động tạo ra các thư mục cache ẩn bắt đầu bằng dấu chấm (ví dụ: `.era_wind_2020010400_...`) ngay tại thư mục chứa file để tối ưu tốc độ đọc. Khi ta thay đổi file, cache cũ không tự xóa và GeoServer vẫn đọc thông tin lỗi từ cache.
* **Cách sửa:** Xóa sạch tất cả các thư mục ẩn bắt đầu bằng dấu chấm (`.`) trong thư mục `era5_mosaic` và khởi động lại container GeoServer.

---

### Lỗi 8: `Cannot enable, no attribute of type Date found` tại tab Dimensions
* **Triệu chứng:** Khi cố gắng kích hoạt chiều thời gian (Time Dimension) cho Layer, GeoServer báo lỗi không tìm thấy thuộc tính kiểu `Date`.
* **Nguyên nhân:** Cột thời gian `granule_time` được Django khởi tạo trong PostgreSQL với kiểu dữ liệu là `timestamp with time zone` (do cấu hình `USE_TZ = True`). Trình điều khiển PostGIS JDBC driver mới của GeoTools/GeoServer tự động ánh xạ kiểu dữ liệu này thành lớp Java `java.time.OffsetDateTime` (hoặc `java.time.Instant`), lớp này không kế thừa từ `java.util.Date` truyền thống nên GeoServer không nhận diện được làm thuộc tính thời gian.
* **Cách sửa:** Chuyển đổi kiểu dữ liệu của cột `granule_time` trong Postgres thành kiểu `timestamp without time zone` (kiểu dữ liệu này sẽ được GeoTools ánh xạ thành `java.sql.Timestamp`, kế thừa từ `java.util.Date`).
  * Thực thi lệnh SQL:
    ```sql
    ALTER TABLE wind_raster_granules_index ALTER COLUMN granule_time TYPE timestamp without time zone;
    ```
  * Khởi động lại container GeoServer để xóa cache cấu trúc bảng: `docker-compose restart geoserver`.

