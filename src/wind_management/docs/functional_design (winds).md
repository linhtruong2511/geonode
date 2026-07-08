# Bản Thiết kế Chức năng (Functional Design)
## Hệ thống Quản lý & Khai thác Dữ liệu Khí tượng - Thủy văn - Hải dương học

> Tài liệu này mô tả **các chức năng** mà hệ thống sẽ cung cấp cho người dùng: chức năng đó dùng để làm gì, hoạt động ra sao (luồng thao tác), đầu vào/đầu ra là gì. Tài liệu **không** đề cập đến công nghệ, framework hay thành phần hệ thống cụ thể nào — phần đó thuộc về thiết kế kỹ thuật (technical design) sẽ làm riêng ở bước sau.

---

## 1. Tổng quan các nhóm chức năng

| Nhóm | Tên nhóm chức năng | Mục đích chính |
|---|---|---|
| A | Trực quan hóa dữ liệu | Xem dữ liệu trên bản đồ và biểu đồ |
| B | Truy vấn dữ liệu | Tìm và trích xuất dữ liệu theo điều kiện |
| C | Phân tích dữ liệu | Tính toán, thống kê, phát hiện xu hướng/bất thường |
| D | Tải dữ liệu theo vùng quan tâm | Xuất dữ liệu về máy người dùng |
| E | Quản trị & nạp dữ liệu | Đưa dữ liệu mới vào hệ thống, quản lý danh mục |
| F | Chức năng hỗ trợ chung | Tìm kiếm, tài khoản, lịch sử thao tác |

---

## 2. Nhóm A — Trực quan hóa dữ liệu

### A1. Xem bản đồ dữ liệu dạng lưới (gió, nhiệt độ, mưa, hải dương)
- **Mục đích**: Cho người dùng nhìn thấy trực quan phân bố không gian của một biến khí tượng/hải dương (VD: tốc độ gió, nhiệt độ mặt biển) tại một thời điểm.
- **Người dùng**: Dự báo viên, nhà nghiên cứu, khách xem công khai (nếu dữ liệu đã mở).
- **Hoạt động**:
  1. Người dùng chọn loại dữ liệu (VD: gió WRF, nhiệt độ ERA5, gió-đại dương CMEMS).
  2. Hệ thống hiển thị lớp dữ liệu tương ứng lên nền bản đồ.
  3. Người dùng có thể phóng to/thu nhỏ, kéo bản đồ để xem khu vực quan tâm.
  4. Người dùng chọn thời điểm cụ thể (qua thanh trượt thời gian, xem mục A6) để xem dữ liệu đúng thời điểm đó.
- **Đầu ra**: Hình ảnh bản đồ trực quan (dạng mũi tên gió, bản đồ màu nhiệt...).

### A2. Xem lớp trạm quan trắc trên bản đồ (Done)
- **Mục đích**: Cho biết vị trí các trạm đo và giá trị đo đạc gần nhất/tại thời điểm được chọn.
- **Hoạt động**:
  1. Các điểm trạm hiển thị dưới dạng ký hiệu trên bản đồ.
  2. Người dùng nhấp vào một trạm → hệ thống hiển thị thông tin chi tiết: tên trạm, tọa độ, giá trị đo đạc mới nhất (nhiệt độ, mưa, gió, áp suất, độ ẩm).
  3. Có thể tô màu điểm trạm theo giá trị một biến (VD: trạm có mưa > 50mm tô màu đỏ) để dễ nhận diện nhanh.
- **Đầu ra**: Danh sách điểm trạm với thông tin popup khi click.

### A3. Xem đường đi bão / vùng ảnh hưởng không khí lạnh
- **Mục đích**: Theo dõi diễn biến của một cơn bão hoặc đợt không khí lạnh theo thời gian.
- **Hoạt động**:
  1. Người dùng chọn một sự kiện (bão/KKL) từ danh sách.
  2. Hệ thống vẽ đường đi (track) của tâm bão hoặc ranh giới ảnh hưởng lên bản đồ.
  3. Người dùng có thể tua qua các mốc thời gian để xem bão di chuyển/mạnh lên - yếu đi ra sao (cường độ, áp suất tâm).
- **Đầu ra**: Đường track trên bản đồ kèm thông tin cường độ tại từng mốc thời gian.

### A4. So sánh hai lớp dữ liệu song song
- **Mục đích**: Giúp người dùng đối chiếu trực quan giữa hai nguồn dữ liệu (VD: dự báo mô hình vs quan trắc thực tế, hoặc hai thời điểm khác nhau).
- **Hoạt động**:
  1. Người dùng chọn lớp dữ liệu thứ nhất và lớp dữ liệu thứ hai.
  2. Hệ thống hiển thị hai bản đồ cạnh nhau (hoặc chồng lớp có thể bật/tắt) với cùng khung nhìn/tỷ lệ.
  3. Người dùng cuộn/di chuyển một bên, bên còn lại tự động đồng bộ theo để dễ so sánh vị trí.
- **Đầu ra**: Hai bản đồ đồng bộ, sẵn sàng để đối chiếu bằng mắt.

### A5. Xem biểu đồ chuỗi thời gian tại một điểm/trạm (Done)
- **Mục đích**: Xem diễn biến của một biến (nhiệt độ, mưa, gió...) theo thời gian tại một vị trí cụ thể, thay vì chỉ xem một thời điểm.
- **Hoạt động**:
  1. Người dùng chọn một trạm (hoặc click một điểm bất kỳ trên lớp dữ liệu lưới).
  2. Người dùng chọn khoảng thời gian quan tâm (VD: 1 tháng, 1 năm).
  3. Hệ thống vẽ biểu đồ đường/cột thể hiện giá trị biến đó theo thời gian.
- **Đầu ra**: Biểu đồ trực quan (đường, cột) có thể phóng to, xem giá trị chi tiết khi rê chuột.

### A6. Thanh trượt thời gian (Time Slider) và phát hoạt ảnh
- **Mục đích**: Cho phép xem diễn biến dữ liệu theo thời gian một cách liên tục, trực quan, giống xem "phim" thời tiết.
- **Hoạt động**:
  1. Người dùng kéo thanh trượt để chọn một thời điểm cụ thể → bản đồ cập nhật tương ứng.
  2. Người dùng có thể bấm "phát" để hệ thống tự động chạy qua các mốc thời gian liên tiếp (giống hoạt ảnh).
  3. Có thể điều chỉnh tốc độ phát, dừng/tiếp tục.
- **Đầu ra**: Trải nghiệm xem diễn biến dữ liệu theo thời gian liên tục.

---

## 3. Nhóm B — Truy vấn dữ liệu

### B1. Truy vấn dữ liệu trạm theo tên trạm/khu vực và khoảng thời gian (Done)
- **Mục đích**: Trích xuất nhanh số liệu đo đạc của một hoặc nhiều trạm trong một khoảng thời gian, phục vụ tra cứu hoặc phân tích tiếp theo.
- **Người dùng**: Nhà nghiên cứu, dự báo viên.
- **Hoạt động**:
  1. Người dùng chọn trạm (gõ tên tìm kiếm, chọn từ danh sách, hoặc click trên bản đồ).
  2. Người dùng chọn khoảng thời gian bắt đầu - kết thúc.
  3. Người dùng chọn các biến muốn xem (mưa, nhiệt độ, gió...) — có thể chọn tất cả.
  4. Hệ thống trả về bảng kết quả và/hoặc biểu đồ.
- **Đầu ra**: Bảng dữ liệu hiển thị trên màn hình, có thể xem trước khi quyết định tải về (xem nhóm D).

### B2. Truy vấn không gian theo bán kính hoặc vùng khoanh (Done)
- **Mục đích**: Tìm tất cả các trạm/điểm dữ liệu nằm trong một khu vực địa lý nhất định, có thể kèm điều kiện về giá trị đo.
- **Hoạt động**:
  1. Người dùng chọn một điểm trên bản đồ và nhập bán kính (VD: 100km), hoặc tự vẽ một vùng bất kỳ.
  2. Người dùng (tùy chọn) thêm điều kiện lọc theo giá trị (VD: chỉ hiện trạm có tốc độ gió > 10m/s).
  3. Người dùng chọn thời điểm hoặc khoảng thời gian áp dụng điều kiện.
  4. Hệ thống liệt kê/đánh dấu các trạm thỏa mãn trên bản đồ.
- **Đầu ra**: Danh sách trạm thỏa điều kiện, hiển thị trên bản đồ và dạng bảng.

### B3. Truy vấn dữ liệu liên quan đến một sự kiện thời tiết (bão/KKL)
- **Mục đích**: Lấy toàn bộ dữ liệu quan trắc nằm trong vùng và thời gian ảnh hưởng của một sự kiện cụ thể, phục vụ đánh giá tác động thực tế.
- **Hoạt động**:
  1. Người dùng chọn một sự kiện (VD: bão Yagi) từ danh sách sự kiện.
  2. Hệ thống tự xác định vùng và khoảng thời gian ảnh hưởng dựa trên đường đi/track của sự kiện.
  3. Hệ thống trả về danh sách các trạm và số liệu đo được nằm trong phạm vi đó.
- **Đầu ra**: Danh sách trạm + số liệu tương ứng với sự kiện đã chọn.

### B4. Truy vấn giá trị dữ liệu lưới tại một điểm hoặc vùng cụ thể
- **Mục đích**: Lấy giá trị của dữ liệu mô hình/lưới (VD: WRF, ERA5) tại một tọa độ hoặc vùng cụ thể mà không cần tải cả file gốc.
- **Hoạt động**:
  1. Người dùng click một điểm trên bản đồ hoặc nhập tọa độ, hoặc vẽ một vùng nhỏ.
  2. Người dùng chọn biến và thời điểm/khoảng thời gian quan tâm.
  3. Hệ thống trả về giá trị tại điểm đó (hoặc giá trị trung bình/thống kê trong vùng đã chọn).
- **Đầu ra**: Giá trị số cụ thể hoặc bảng/biểu đồ giá trị theo thời gian tại vị trí đã chọn.

### B5. Truy vấn kết hợp nhiều nguồn dữ liệu
- **Mục đích**: So sánh trực tiếp dữ liệu mô hình dự báo với dữ liệu quan trắc thực tế tại cùng một vị trí và thời gian, phục vụ đánh giá độ tin cậy.
- **Hoạt động**:
  1. Người dùng chọn một trạm (đại diện cho dữ liệu thực đo) và một nguồn dữ liệu mô hình (đại diện cho dự báo).
  2. Người dùng chọn biến cần so sánh (VD: mưa, gió) và khoảng thời gian.
  3. Hệ thống truy vấn cả hai nguồn tại cùng vị trí/thời gian, hiển thị kết quả song song (bảng hoặc biểu đồ chồng).
- **Đầu ra**: Bảng/biểu đồ so sánh hai chuỗi giá trị (thực đo và mô hình).

---

## 4. Nhóm C — Phân tích dữ liệu

### C1. Thống kê tổng hợp theo trạm/khu vực
- **Mục đích**: Tổng hợp nhanh các chỉ số thống kê (trung bình, lớn nhất, nhỏ nhất, tổng) của một biến theo ngày/tháng/năm, phục vụ báo cáo.
- **Hoạt động**:
  1. Người dùng chọn trạm hoặc khu vực, biến cần thống kê, và đơn vị thời gian tổng hợp (ngày/tháng/năm).
  2. Hệ thống tính toán và hiển thị kết quả dưới dạng bảng và biểu đồ cột.
  3. Người dùng có thể xuất kết quả thống kê ra file báo cáo.
- **Đầu ra**: Bảng/biểu đồ thống kê, file báo cáo tổng hợp.

### C2. Phát hiện các hiện tượng cực trị
- **Mục đích**: Tự động xác định các đợt nắng nóng, rét đậm, mưa lớn bất thường dựa trên ngưỡng do người dùng hoặc hệ thống định nghĩa.
- **Hoạt động**:
  1. Người dùng chọn biến (nhiệt độ, lượng mưa...) và ngưỡng xác định cực trị (VD: nhiệt độ > 39°C, mưa 24h > 100mm), hoặc dùng ngưỡng mặc định.
  2. Người dùng chọn khu vực và khoảng thời gian cần rà soát.
  3. Hệ thống liệt kê các đợt/thời điểm/trạm vượt ngưỡng, đánh dấu trên bản đồ và mốc thời gian.
- **Đầu ra**: Danh sách các đợt cực trị được phát hiện, kèm vị trí và thời điểm.

### C3. Phân tích quỹ đạo và đặc điểm của bão
- **Mục đích**: Cung cấp các chỉ số định lượng về một cơn bão để hỗ trợ đánh giá mức độ nguy hiểm và phạm vi ảnh hưởng.
- **Hoạt động**:
  1. Người dùng chọn một sự kiện bão.
  2. Hệ thống tự tính: tốc độ di chuyển trung bình, hướng di chuyển chủ đạo, thời gian và khu vực bão có khả năng ảnh hưởng trực tiếp.
  3. Kết quả hiển thị kèm hình ảnh trực quan (đường đi, vùng ảnh hưởng theo từng giai đoạn).
- **Đầu ra**: Báo cáo tóm tắt đặc điểm cơn bão kèm hình ảnh minh họa.

### C4. Đánh giá độ chính xác của mô hình dự báo (so với thực đo)
- **Mục đích**: Đo lường mức độ sai lệch giữa dữ liệu dự báo (mô hình) và dữ liệu thực đo tại trạm, giúp đánh giá độ tin cậy của từng nguồn mô hình.
- **Hoạt động**:
  1. Người dùng chọn nguồn mô hình cần đánh giá, trạm/khu vực đối chiếu, biến và khoảng thời gian.
  2. Hệ thống tự động đối sánh giá trị dự báo và thực đo tại cùng vị trí/thời gian.
  3. Hệ thống trả về các chỉ số đánh giá sai số (mức độ lệch trung bình, xu hướng lệch cao/thấp hơn thực tế) dưới dạng dễ hiểu (số liệu + biểu đồ).
- **Đầu ra**: Báo cáo đánh giá độ chính xác mô hình, kèm biểu đồ so sánh.

### C5. Nội suy tạo bản đồ liên tục từ dữ liệu điểm
- **Mục đích**: Từ dữ liệu rời rạc tại các trạm, tạo ra một bản đồ ước lượng giá trị liên tục trên toàn khu vực (cho những nơi không có trạm đo).
- **Hoạt động**:
  1. Người dùng chọn biến cần nội suy (VD: lượng mưa) và khu vực, thời điểm quan tâm.
  2. Hệ thống tính toán và hiển thị bản đồ ước lượng liên tục dựa trên giá trị tại các trạm lân cận.
  3. Người dùng có thể xem độ tin cậy ước lượng (VD: khu vực xa trạm sẽ có độ tin cậy thấp hơn) nếu cần.
- **Đầu ra**: Bản đồ nội suy trực quan phủ toàn khu vực được chọn.

### C6. Cảnh báo tự động khi giá trị vượt ngưỡng
- **Mục đích**: Chủ động thông báo cho người dùng khi có hiện tượng thời tiết đáng chú ý xảy ra, không cần người dùng phải tự kiểm tra thủ công.
- **Hoạt động**:
  1. Người dùng thiết lập điều kiện cảnh báo quan tâm (VD: gió cấp bão tại khu vực X, mưa > 100mm/24h tại trạm Y).
  2. Khi dữ liệu mới được cập nhật và thỏa điều kiện, hệ thống tự động đánh dấu/khoanh vùng và gửi thông báo cho người dùng.
  3. Người dùng có thể xem lại lịch sử các cảnh báo đã phát sinh.
- **Đầu ra**: Thông báo (trên hệ thống và/hoặc qua email) kèm vị trí, thời điểm và mức độ vượt ngưỡng.

---

## 5. Nhóm D — Tải dữ liệu theo vùng quan tâm (AOI Download)

### D1. Chọn vùng quan tâm (Area of Interest)
- **Mục đích**: Cho phép người dùng xác định chính xác khu vực họ cần dữ liệu, tránh phải tải toàn bộ dữ liệu không cần thiết.
- **Hoạt động**:
  1. Người dùng vẽ tự do một vùng trên bản đồ, hoặc nhập tọa độ khung bao (bounding box), hoặc chọn một/nhiều trạm cụ thể.
  2. Hệ thống hiển thị lại vùng đã chọn để người dùng xác nhận trước khi tiếp tục.
- **Đầu ra**: Một vùng/danh sách trạm được xác định làm phạm vi tải dữ liệu.

### D2. Chọn loại dữ liệu và khoảng thời gian cần tải
- **Mục đích**: Xác định chính xác nội dung dữ liệu người dùng cần (loại dữ liệu, biến, khoảng thời gian) để đóng gói đúng và đủ.
- **Hoạt động**:
  1. Người dùng chọn loại dữ liệu (dữ liệu trạm / dữ liệu lưới mô hình / đường đi bão...).
  2. Người dùng chọn biến cụ thể (nếu có nhiều biến) và khoảng thời gian.
  3. Hệ thống ước tính sơ bộ dung lượng/thời gian xử lý và thông báo cho người dùng trước khi xác nhận (đặc biệt nếu yêu cầu lớn).
- **Đầu ra**: Yêu cầu tải dữ liệu đã được xác định đầy đủ tham số, sẵn sàng xử lý.

### D3. Xử lý và đóng gói dữ liệu theo yêu cầu
- **Mục đích**: Tự động trích xuất đúng phần dữ liệu người dùng cần (theo vùng, biến, thời gian đã chọn), không bắt người dùng tải nguyên bộ dữ liệu gốc.
- **Hoạt động**:
  1. Hệ thống xử lý yêu cầu ở chế độ nền (không bắt người dùng phải chờ trên màn hình nếu yêu cầu lớn).
  2. Với yêu cầu nhỏ, kết quả có thể sẵn sàng gần như ngay lập tức.
  3. Với yêu cầu lớn, hệ thống xử lý dần và thông báo khi hoàn tất.
- **Đầu ra**: Gói dữ liệu đã được cắt/trích xuất đúng phạm vi yêu cầu.

### D4. Nhận và tải kết quả
- **Mục đích**: Đưa dữ liệu đã xử lý đến tay người dùng một cách thuận tiện.
- **Hoạt động**:
  1. Nếu xử lý nhanh: người dùng thấy nút "Tải về" xuất hiện ngay trên giao diện.
  2. Nếu xử lý mất thời gian: hệ thống gửi thông báo (trong hệ thống và/hoặc email) kèm đường dẫn tải khi hoàn tất.
  3. Người dùng có thể xem lại danh sách các yêu cầu tải trước đó và tải lại nếu cần (trong một khoảng thời gian lưu trữ nhất định).
- **Đầu ra**: File dữ liệu (hoặc gói nhiều file) sẵn sàng để tải về máy người dùng.

---

## 6. Nhóm E — Quản trị & Nạp dữ liệu (dành cho quản trị viên)

### E1. Nạp dữ liệu mới vào hệ thống
- **Mục đích**: Đưa dữ liệu quan trắc/mô hình mới nhất vào hệ thống để phục vụ các chức năng xem/truy vấn/phân tích.
- **Hoạt động**:
  1. Quản trị viên cung cấp dữ liệu mới (file trạm, file mô hình, dữ liệu vệ tinh...).
  2. Hệ thống kiểm tra, làm sạch dữ liệu (loại bỏ ký tự nhiễu, định dạng sai) trước khi đưa vào lưu trữ chính thức.
  3. Hệ thống thông báo kết quả nạp dữ liệu (thành công/thất bại, số bản ghi đã xử lý, lỗi nếu có).
- **Đầu ra**: Dữ liệu mới được đưa vào hệ thống, sẵn sàng phục vụ các chức năng khác.

### E2. Quản lý danh mục và thông tin mô tả (metadata)
- **Mục đích**: Đảm bảo mỗi bộ dữ liệu/lớp dữ liệu có thông tin mô tả rõ ràng để người dùng dễ tìm và hiểu đúng ý nghĩa.
- **Hoạt động**:
  1. Quản trị viên tạo/chỉnh sửa thông tin mô tả cho mỗi lớp dữ liệu (tên, nguồn gốc, đơn vị, phạm vi thời gian/không gian, ghi chú chất lượng).
  2. Thông tin này hiển thị cho người dùng khi họ xem/tìm kiếm lớp dữ liệu tương ứng.
- **Đầu ra**: Danh mục dữ liệu có mô tả đầy đủ, dễ tra cứu.

### E3. Quản lý phân quyền truy cập dữ liệu
- **Mục đích**: Kiểm soát dữ liệu nào công khai, dữ liệu nào chỉ dành cho người dùng nội bộ/được cấp quyền.
- **Hoạt động**:
  1. Quản trị viên gán mức truy cập cho từng lớp/bộ dữ liệu (công khai, nội bộ, riêng theo nhóm người dùng).
  2. Hệ thống tự động ẩn/hiện chức năng xem, truy vấn, tải dữ liệu tương ứng với quyền của từng người dùng đang đăng nhập.
- **Đầu ra**: Dữ liệu được hiển thị/truy cập đúng theo quyền hạn của người dùng.

### E4. Giám sát tình trạng hệ thống và dữ liệu
- **Mục đích**: Giúp quản trị viên nắm được tình trạng vận hành để kịp thời xử lý sự cố hoặc lên kế hoạch mở rộng.
- **Hoạt động**:
  1. Hệ thống hiển thị các chỉ số vận hành: dung lượng dữ liệu đã dùng, số lượng yêu cầu truy vấn/tải trong ngày, các yêu cầu đang xử lý/thất bại.
  2. Quản trị viên nhận cảnh báo khi có bất thường (VD: dung lượng gần đầy, yêu cầu xử lý bị treo).
- **Đầu ra**: Bảng theo dõi tình trạng hệ thống cho quản trị viên.

---

## 7. Nhóm F — Chức năng hỗ trợ chung

### F1. Tìm kiếm bộ dữ liệu/lớp dữ liệu
- **Mục đích**: Giúp người dùng nhanh chóng tìm ra lớp dữ liệu mình cần trong số nhiều loại dữ liệu khác nhau.
- **Hoạt động**: Người dùng gõ từ khóa (tên biến, khu vực, loại dữ liệu, thời gian) → hệ thống trả về danh sách lớp dữ liệu phù hợp kèm mô tả ngắn.
- **Đầu ra**: Danh sách kết quả tìm kiếm, có thể click để mở trực tiếp lên bản đồ.

### F2. Quản lý tài khoản người dùng
- **Mục đích**: Cho phép người dùng đăng ký/đăng nhập, quản lý thông tin cá nhân và quyền truy cập của mình.
- **Hoạt động**: Đăng ký/đăng nhập, cập nhật thông tin cá nhân, xem quyền truy cập hiện có, yêu cầu cấp thêm quyền nếu cần.
- **Đầu ra**: Tài khoản người dùng được quản lý, phân quyền rõ ràng.

### F3. Lịch sử truy vấn và tải dữ liệu của cá nhân
- **Mục đích**: Giúp người dùng xem lại, tái sử dụng các truy vấn/yêu cầu tải trước đó mà không cần thiết lập lại từ đầu.
- **Hoạt động**: Người dùng vào mục "Lịch sử của tôi" → xem danh sách các truy vấn/tải đã thực hiện → có thể chạy lại hoặc tải lại kết quả cũ (nếu còn lưu trữ).
- **Đầu ra**: Danh sách lịch sử thao tác cá nhân, có thể thao tác lại nhanh.

---

## 8. Ma trận chức năng theo vai trò người dùng

| Chức năng | Khách/Public | Dự báo viên | Nhà nghiên cứu | Quản trị viên |
|---|:---:|:---:|:---:|:---:|
| A — Trực quan hóa | ✔ (dữ liệu công khai) | ✔ | ✔ | ✔ |
| B — Truy vấn | ✔ (giới hạn) | ✔ | ✔ | ✔ |
| C — Phân tích | – | ✔ | ✔ | ✔ |
| D — Tải dữ liệu theo AOI | ✔ (giới hạn, dữ liệu công khai) | ✔ | ✔ | ✔ |
| E — Quản trị & nạp dữ liệu | – | – | – | ✔ |
| F — Hỗ trợ chung | ✔ (một phần) | ✔ | ✔ | ✔ |

---

## 9. Ghi chú phạm vi tài liệu

Tài liệu này tập trung mô tả **chức năng** (functional design): người dùng làm gì, hệ thống phản hồi ra sao, phục vụ mục đích gì. Các quyết định về công nghệ, kiến trúc dữ liệu, hiệu năng cụ thể được xử lý trong `db_architecture_plan.md` (thiết kế CSDL) và sẽ được bổ sung ở một tài liệu thiết kế kỹ thuật (technical design) riêng nếu cần.
