from django.contrib.gis.geos import Point
import logging
import json
from datetime import datetime, timezone
from urllib.parse import urlencode

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Count, Q, Avg, Max, Min, StdDev, FloatField
from django.db.models.functions import TruncMonth, TruncYear
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.views.generic import CreateView, DeleteView, DetailView, FormView, ListView, TemplateView, UpdateView
from django.core.paginator import Paginator

from .models import (
    Satellite, MeasurementSource, Measurement,
    MonitoringLocation, TemporalSeries, DataComparison,
    AnalysisJob, AuditLog, JobStatus
)

logger = logging.getLogger(__name__)


def resolve_attr(obj, accessor):
    """
    Hàm hỗ trợ truy xuất thuộc tính hoặc phương thức của một đối tượng dựa trên chuỗi truy cập.
    Ví dụ: accessor='satellite.name' sẽ trả về obj.satellite.name
    """
    value = obj
    for part in accessor.split("."):
        value = getattr(value, part, None)
        if callable(value):
            value = value()
        if value is None:
            break
    return value


class CO2TemplateMixin(LoginRequiredMixin):
    """
    Mixin cơ sở để cung cấp các thuộc tính và ngữ cảnh (context) chung cho các template của module CO2.
    Đảm bảo người dùng phải đăng nhập mới có quyền truy cập.
    """
    active_section = "dashboard" # Phân đoạn đang hoạt động trong menu điều hướng
    page_title = "" # Tiêu đề chính của trang
    page_subtitle = "" # Mô tả ngắn dưới tiêu đề
    primary_action = None # Hành động chính trên trang (nút bấm, link)
    map_config = {} # Cấu hình bản đồ cho view này

    def get_map_config(self):
        """Phương thức ghi đè để cấu hình trạng thái bản đồ (vị trí tâm, mức zoom, URL dữ liệu)"""
        return self.map_config

    def get_context_data(self, **kwargs):
        """Bổ sung các tham số chung vào context của template"""
        try:
            context = super().get_context_data(**kwargs)
        except AttributeError:
            context = {}
            context.update(kwargs)
        
        config = self.get_map_config()
        context["active_section"] = self.active_section
        context["page_title"] = self.page_title
        context["page_subtitle"] = self.page_subtitle
        context["primary_action"] = self.primary_action
        context["map_config"] = config
        context["map_config_json"] = json.dumps(config)
        return context


class CO2SearchableListView(CO2TemplateMixin, ListView):
    """
    View danh sách chung hỗ trợ tìm kiếm, phân trang và tự động định dạng bảng dữ liệu.
    """
    template_name = "co2_management/crud_list.html"
    paginate_by = 12 # Số lượng bản ghi mỗi trang
    search_fields = [] # Các trường dữ liệu hỗ trợ tìm kiếm (icontains)
    table_columns = [] # Danh sách các cột hiển thị: [(nhãn, truy cập), ...]
    create_url_name = None # Name URL để tạo mới đối tượng
    detail_url_name = None # Name URL để xem chi tiết
    edit_url_name = None # Name URL để chỉnh sửa
    delete_url_name = None # Name URL để xóa
    empty_message = _("Không tìm thấy bản ghi nào.")

    def get_search_query(self):
        """Lấy từ khóa tìm kiếm từ tham số URL 'q'"""
        return self.request.GET.get("q", "").strip()

    def get_queryset(self):
        """Lọc danh sách dữ liệu dựa trên từ khóa tìm kiếm"""
        queryset = super().get_queryset()
        q = self.get_search_query()
        if q and self.search_fields:
            predicate = Q()
            for field in self.search_fields:
                predicate |= Q(**{f"{field}__icontains": q})
            queryset = queryset.filter(predicate)
        return queryset

    def build_row(self, obj):
        """Xây dựng dữ liệu cho từng hàng của bảng dựa trên table_columns"""
        row = []
        for label, accessor in self.table_columns:
            value = accessor(obj) if callable(accessor) else resolve_attr(obj, accessor)
            row.append({"label": label, "value": value})
        actions = [] # Các nút thao tác (Chi tiết, Sửa, Xóa)
        if self.detail_url_name:
            actions.append({"label": _("Chi tiết"), "url": reverse(self.detail_url_name, kwargs={"pk": obj.pk})})
        if self.edit_url_name:
            actions.append({"label": _("Sửa"), "url": reverse(self.edit_url_name, kwargs={"pk": obj.pk})})
        if self.delete_url_name:
            actions.append(
                {
                    "label": _("Xóa"),
                    "url": reverse(self.delete_url_name, kwargs={"pk": obj.pk}),
                    "style": "danger",
                }
            )
        return {"object": obj, "cells": row, "actions": actions}

    def get_context_data(self, **kwargs):
        """Bổ sung tiêu đề bảng và dữ liệu hàng đã được xử lý vào context"""
        context = super().get_context_data(**kwargs)
        context["search_query"] = self.get_search_query()
        context["table_headers"] = [label for label, _ in self.table_columns]
        context["table_rows"] = [self.build_row(obj) for obj in context["object_list"]]
        context["empty_message"] = self.empty_message
        if self.create_url_name:
            context["primary_action"] = {"label": _("Tạo mới"), "url": reverse(self.create_url_name)}
        return context


class CO2GenericDetailView(CO2TemplateMixin, DetailView):
    """
    View chi tiết đối tượng chung, hỗ trợ hiển thị thông tin dạng danh sách cặp nhãn-giá trị.
    """
    template_name = "co2_management/crud_detail.html"
    detail_fields = [] # Danh sách các trường hiển thị chi tiết: [(nhãn, truy cập), ...]
    edit_url_name = None # Name URL để chỉnh sửa
    delete_url_name = None # Name URL để xóa

    def get_detail_rows(self):
        """Trích xuất dữ liệu chi tiết cho từng trường đã định nghĩa"""
        rows = []
        for label, accessor in self.detail_fields:
            value = accessor(self.object) if callable(accessor) else resolve_attr(self.object, accessor)
            rows.append({"label": label, "value": value})
        return rows

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["detail_rows"] = self.get_detail_rows()
        if self.edit_url_name:
            context["edit_url"] = reverse(self.edit_url_name, kwargs={"pk": self.object.pk})
        if self.delete_url_name:
            context["delete_url"] = reverse(self.delete_url_name, kwargs={"pk": self.object.pk})
        return context


def trigger_source_import(request, pk):
    """
    Hàm view hỗ trợ kích hoạt thủ công tác vụ nhập dữ liệu từ giao diện.
    """
    from .tasks import import_data_file_task
    source = get_object_or_404(MeasurementSource, pk=pk)
    import_data_file_task.delay(source.pk)
    messages.success(request, _("Đã bắt đầu quy trình nhập dữ liệu cho tệp %s. Vui lòng chờ vài phút.") % source.file_name)
    return redirect("co2_management:source_detail", pk=source.pk)


# --- Page Views (Các trang chức năng cụ thể) ---

class DashboardView(CO2TemplateMixin, TemplateView):
    """
    Trang Bảng điều khiển (Dashboard) tổng quan của hệ thống CO2.
    Hiển thị các thống kê quan trọng, biểu đồ phân tích dữ liệu theo nguồn,
    xu hướng theo tháng, và danh sách hoạt động gần đây.
    """
    template_name = "co2_management/dashboard.html"
    active_section = "dashboard"
    page_title = _("Bảng điều khiển CO2")
    page_subtitle = _("Tổng quan hệ thống giám sát và phân tích dữ liệu XCO2.")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # ── 1. KPI tổng quan ──────────────────────────────────────────────
        base_qs = Measurement.objects.filter(deleted_at__isnull=True)
        agg = base_qs.aggregate(
            total=Count('id'),
            avg_xco2=Avg('xco2_ppm'),
            max_xco2=Max('xco2_ppm'),
            min_xco2=Min('xco2_ppm'),
        )
        context["stats"] = {
            "measurements_total": agg['total'] or 0,
            "sources_total":      MeasurementSource.objects.count(),
            "locations_total":    MonitoringLocation.objects.count(),
            "comparisons_total":  DataComparison.objects.count(),
            "jobs_total":         AnalysisJob.objects.count(),
            "jobs_running":       AnalysisJob.objects.filter(
                status__in=[JobStatus.PENDING, JobStatus.RUNNING]
            ).count(),
            "avg_xco2":           round(agg['avg_xco2'], 2) if agg['avg_xco2'] else 0,
            "max_xco2":           round(agg['max_xco2'], 2) if agg['max_xco2'] else 0,
            "min_xco2":           round(agg['min_xco2'], 2) if agg['min_xco2'] else 0,
            "good_quality_pct":   self._good_quality_pct(base_qs),
        }

        # ── 2. Phân bố theo nguồn (biểu đồ Donut) ────────────────────────
        by_source = list(
            base_qs.values('data_source')
            .annotate(count=Count('id'), avg=Avg('xco2_ppm'))
            .order_by('data_source')
        )
        context["by_source_json"] = json.dumps([
            {
                "label": s['data_source'],
                "count": s['count'],
                "avg":   round(s['avg'], 2) if s['avg'] else 0,
            }
            for s in by_source
        ])

        # ── 3. Xu hướng XCO2 theo tháng (biểu đồ Line) ───────────────────
        monthly = list(
            base_qs.filter(xco2_quality_flag=0)
            .annotate(month=TruncMonth('measurement_time'))
            .values('month', 'data_source')
            .annotate(avg_xco2=Avg('xco2_ppm'), cnt=Count('id'))
            .order_by('month')
        )
        context["monthly_trend_json"] = json.dumps([
            {
                "month":  m['month'].strftime('%Y-%m') if m['month'] else '',
                "source": m['data_source'],
                "avg":    round(m['avg_xco2'], 3) if m['avg_xco2'] else 0,
                "count":  m['cnt'],
            }
            for m in monthly
        ])

        # ── 4. Trạng thái Jobs (biểu đồ Bar ngang) ───────────────────────
        jobs_by_status = list(
            AnalysisJob.objects.values('status')
            .annotate(count=Count('id'))
        )
        context["jobs_by_status_json"] = json.dumps([
            {"status": j['status'], "count": j['count']}
            for j in jobs_by_status
        ])

        # ── 5. Danh sách gần đây ─────────────────────────────────────────
        context["recent_sources"] = MeasurementSource.objects.order_by("-id")[:5]
        context["recent_jobs"]    = AnalysisJob.objects.order_by("-id")[:5]

        return context

    def _good_quality_pct(self, base_qs):
        """Tỷ lệ % điểm đo chất lượng tốt (xco2_quality_flag=0)"""
        total = base_qs.count()
        if not total:
            return 0
        good = base_qs.filter(xco2_quality_flag=0).count()
        return round(good / total * 100, 1)

    def get_map_config(self):
        """Cấu hình mặc định cho bản đồ trên Dashboard (vùng Việt Nam)"""
        return {
            "center": [16.0, 107.0],
            "zoom": 5,
            "data_url": "/co2/api/v1/measurements/spatial_query/?limit=500&quality=0",
        }


class SatelliteListView(CO2SearchableListView):
    """Hiển thị danh sách các vệ tinh quan trắc trong hệ thống"""
    model = Satellite
    active_section = "satellites"
    page_title = _("Danh sách vệ tinh")
    table_columns = [
        (_("Tên vệ tinh"), "satellite_name"),
        (_("Nhà mạng"), "operator"),
        (_("Ngày phóng"), "launch_date"),
        (_("Đang hoạt định"), lambda obj: "Có" if obj.is_active else "Không"),
    ]
    detail_url_name = "co2_management:satellite_detail"


class SatelliteDetailView(CO2GenericDetailView):
    """Hiển thị chi tiết thông tin và thiết bị của một vệ tinh cụ thể"""
    model = Satellite
    active_section = "satellites"
    template_name = "co2_management/satellite_detail.html"
    page_title = _("Chi tiết vệ tinh")
    detail_fields = [
        (_("Tên"), "satellite_name"),
        (_("Nhà mạng"), "operator"),
        (_("Ngày phóng"), "launch_date"),
        (_("Độ cao (km)"), "orbital_altitude_km"),
        (_("Chu kỳ (phút)"), "orbital_period_minutes"),
        (_("Độ nghiêng quỹ đạo"), "orbital_inclination_deg"),
        (_("Trạng thái"), lambda obj: "Hoạt động" if obj.is_active else "Ngừng hoạt động"),
    ]

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Lấy thêm danh sách thiết bị thuộc vệ tinh này
        context["instruments"] = self.object.instruments.all()
        return context


class SourceListView(CO2SearchableListView):
    """Danh sách các tệp nguồn dữ liệu đã nhập vào hệ thống"""
    model = MeasurementSource
    active_section = "sources"
    page_title = _("Nguồn dữ liệu (Files)")
    search_fields = ["file_name", "satellite__satellite_name"]
    table_columns = [
        (_("Tên file"), "file_name"),
        (_("Vệ tinh"), "satellite.satellite_name"),
        (_("Ngày đo"), "measurement_date"),
        (_("Soundings"), "total_soundings"),
        (_("Checked"), lambda obj: "✔" if obj.quality_checked else "-"),
    ]
    detail_url_name = "co2_management:source_detail"


class SourceDetailView(CO2GenericDetailView):
    """Chi tiết về một tệp nguồn dữ liệu và các siêu dữ liệu xử lý"""
    model = MeasurementSource
    active_section = "sources"
    template_name = "co2_management/source_detail.html"
    page_title = _("Chi tiết file dữ liệu")
    detail_fields = [
        (_("Tên file"), "file_name"),
        (_("Vệ tinh"), "satellite.satellite_name"),
        (_("Định dạng"), "file_format"),
        (_("Kích thước (MB)"), "file_size_mb"),
        (_("Ngày đo"), "measurement_date"),
        (_("Số lượng bản ghi"), "total_soundings"),
        (_("Đã kiểm tra CL"), lambda obj: "Rồi" if obj.quality_checked else "Chưa"),
        (_("Level"), "processing_level"),
        (_("Algorithm"), "algorithm_version"),
    ]

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Bổ sung nút bấm thực hiện Import dữ liệu
        if not self.object.quality_checked:
            context["primary_action"] = {
                "label": _("Xử lý tệp (Import)"),
                "url": reverse("co2_management:source_import_trigger", kwargs={"pk": self.object.pk})
            }
        return context

    def get_map_config(self):
        """
        Cấu hình bản đồ để lấy toàn bộ các điểm đo thuộc về tệp nguồn này.
        Sử dụng spatial_query API với tham số lọc source_id.
        """
        url = reverse("co2_management:measurement-list") + f"spatial_query/?source_id={self.object.pk}&limit=5000"
        return {
            "data_url": url,
            "fit_bounds": True # Gợi ý cho frontend tự động thu phóng bản đồ để hiển thị hết các điểm
        }


class MeasurementListView(CO2TemplateMixin, ListView):
    """
    Trang danh sách dữ liệu đo đạc chi tiết với bộ lọc nâng cao theo không gian, thời gian và chất lượng.
    """
    model = Measurement
    active_section = "measurements"
    template_name = "co2_management/measurement_list.html"
    page_title = _("Dữ liệu đo lường")
    paginate_by = 20

    def get_queryset(self):
        """Xây dựng queryset dựa trên các tham số lọc từ yêu cầu (GET parameters)"""
        qs = Measurement.objects.select_related("source")
        
        # Lọc theo nguồn dữ liệu (OCO2/GOSAT2)
        src = self.request.GET.get("source")
        if src:
            qs = qs.filter(data_source=src)
            
        # Lọc theo chất lượng (0: Tốt)
        q_flag = self.request.GET.get("quality")
        if q_flag == '0':
            qs = qs.filter(xco2_quality_flag=0)
            
        # Lọc theo dải nồng độ XCO2
        min_xco2 = self.request.GET.get("min_xco2")
        if min_xco2:
            qs = qs.filter(xco2_ppm__gte=float(min_xco2))
            
        max_xco2 = self.request.GET.get("max_xco2")
        if max_xco2:
            qs = qs.filter(xco2_ppm__lte=float(max_xco2))
            
        # Lọc theo thời gian
        date_from = self.request.GET.get("date_from")
        if date_from:
            qs = qs.filter(measurement_time__date__gte=date_from)
            
        date_to = self.request.GET.get("date_to")
        if date_to:
            qs = qs.filter(measurement_time__date__lte=date_to)
            
        # Lọc theo vùng quan sát (Bounding Box)
        min_lat = self.request.GET.get("min_lat")
        max_lat = self.request.GET.get("max_lat")
        min_lon = self.request.GET.get("min_lon")
        max_lon = self.request.GET.get("max_lon")
        
        if min_lat and max_lat and min_lon and max_lon:
            qs = qs.filter(
                latitude__gte=float(min_lat),
                latitude__lte=float(max_lat),
                longitude__gte=float(min_lon),
                longitude__lte=float(max_lon)
            )
        
        # Lọc theo vùng hình học tùy ý (WKT Polygon/Rectangle)
        geometry_wkt = self.request.GET.get("geometry")
        if geometry_wkt:
            try:
                from django.contrib.gis.geos import GEOSGeometry
                geom = GEOSGeometry(geometry_wkt, srid=4326)
                qs = qs.filter(geom__intersects=geom)
            except Exception as e:
                logger.error(f"Spatial filter error: {e}")
            
        return qs.order_by("-measurement_time")

    def get_map_config(self):
        """Cung cấp URL API để bản đồ tải dữ liệu dựa trên các tham số lọc hiện tại"""
        params = self.request.GET.copy()
        if 'page' in params:
            del params['page']
            
        url = reverse("co2_management:measurement-list") + "spatial_query/"
        
        query_string = params.urlencode()
        if query_string:
            url += f"?{query_string}"
            
        return {
            "data_url": url
        }


class MeasurementDetailView(CO2GenericDetailView):
    """Trang chi tiết của một điểm đo duy nhất, bao gồm cả hồ sơ thẳng đứng (profile)"""
    model = Measurement
    active_section = "measurements"
    template_name = "co2_management/measurement_detail.html"
    page_title = _("Chi tiết điểm đo")
    detail_fields = [
        (_("Nguồn dữ liệu"), "data_source"),
        (_("Thời gian"), "measurement_time"),
        (_("XCO2 (ppm)"), "xco2_ppm"),
        (_("Sai số (ppm)"), "xco2_uncertainty_ppm"),
        (_("Vĩ độ"), "latitude"),
        (_("Kinh độ"), "longitude"),
        (_("Cờ chất lượng"), "xco2_quality_flag"),
        (_("Áp suất bề mặt (hPa)"), "surface_pressure_hpa"),
        (_("Cờ mây"), "cloud_flag"),
    ]

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Lấy hồ sơ thẳng đứng của điểm đo này, sắp xếp theo áp suất
        context["profiles"] = self.object.profiles.order_by('pressure_hpa')
        
        # Logic điều hướng: Tìm điểm đo trước và sau dựa trên thời gian đo (giảm dần)
        base_qs = Measurement.objects.filter(deleted_at__isnull=True)
        
        # Điểm kế tiếp (Tiếp theo trong danh sách -> Cũ hơn)
        context["next_obj"] = base_qs.filter(
            Q(measurement_time__lt=self.object.measurement_time) | 
            Q(measurement_time=self.object.measurement_time, id__lt=self.object.id)
        ).order_by("-measurement_time", "-id").first()

        # Điểm trước đó (Trước đó trong danh sách -> Mới hơn)
        context["prev_obj"] = base_qs.filter(
            Q(measurement_time__gt=self.object.measurement_time) | 
            Q(measurement_time=self.object.measurement_time, id__gt=self.object.id)
        ).order_by("measurement_time", "id").first()
        
        return context

    def get_map_config(self):
        """Căn giữa bản đồ vào vị trí của điểm đo"""
        return {
            "center": [self.object.latitude, self.object.longitude],
            "zoom": 12,
        }

# --- Quản lý Vị trí Giám sát (CRUD) ---

class LocationListView(CO2SearchableListView):
    """Danh sách các địa điểm cần giám sát định kỳ"""
    model = MonitoringLocation
    active_section = "locations"
    page_title = _("Vị trí giám sát")
    search_fields = ["location_name"]
    table_columns = [
        (_("Tên vị trí"), "location_name"),
        (_("Loại"), "location_type"),
        (_("Vĩ độ"), "latitude"),
        (_("Kinh độ"), "longitude"),
        (_("Bán kính (km)"), "radius_km"),
    ]
    create_url_name = "co2_management:location_create"
    detail_url_name = "co2_management:location_detail"
    edit_url_name = "co2_management:location_update"
    delete_url_name = "co2_management:location_delete"

class LocationCreateView(CO2TemplateMixin, CreateView):
    """Biểu mẫu thêm mới vị trí giám sát"""
    model = MonitoringLocation
    fields = ["location_name", "location_type", "latitude", "longitude", "radius_km"]
    active_section = "locations"
    template_name = "co2_management/location_form.html"
    page_title = _("Thêm vị trí giám sát")

    def get_initial(self):
        # Thiết lập giá trị mặc định cho bán kính
        return {"radius_km": 1.0}

    def get_success_url(self):
        return reverse("co2_management:location_list")

class LocationDetailView(CO2GenericDetailView):
    """Thông tin chi tiết về một vị trí giám sát"""
    model = MonitoringLocation
    active_section = "locations"
    template_name = "co2_management/location_detail.html"
    page_title = _("Chi tiết vị trí giám sát")
    detail_fields = [
        (_("Tên"), "location_name"),
        (_("Loại"), "location_type"),
        (_("Vĩ độ"), "latitude"),
        (_("Kinh độ"), "longitude"),
        (_("Bán kính (km)"), "radius_km"),
    ]
    edit_url_name = "co2_management:location_update"
    delete_url_name = "co2_management:location_delete"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Cung cấp URL API để fetch chuỗi thời gian và thống kê cho vị trí này
        base_url = reverse("co2_management:monitoringlocation-detail", kwargs={"pk": self.object.pk})
        context["timeseries_api_url"] = base_url + "timeseries/"
        context["statistics_api_url"] = base_url + "statistics/"
        return context

class LocationUpdateView(CO2TemplateMixin, UpdateView):
    """Biểu mẫu chỉnh sửa thông tin vị trí giám sát"""
    model = MonitoringLocation
    fields = ["location_name", "location_type", "latitude", "longitude", "radius_km"]
    active_section = "locations"
    template_name = "co2_management/location_form.html"
    page_title = _("Sửa vị trí giám sát")

    def get_success_url(self):
        return reverse("co2_management:location_detail", kwargs={"pk": self.object.pk})

class LocationDeleteView(CO2TemplateMixin, DeleteView):
    """Trang xác nhận xóa vị trí giám sát"""
    model = MonitoringLocation
    active_section = "locations"
    template_name = "co2_management/crud_confirm_delete.html"
    page_title = _("Xóa vị trí giám sát")

    def get_success_url(self):
        return reverse("co2_management:location_list")


class ComparisonListView(CO2SearchableListView):
    """Hiển thị các kết quả so sánh đối chiếu dữ liệu giữa các nguồn (OCO-2 vs GOSAT-2)"""
    model = DataComparison
    active_section = "comparisons"
    page_title = _("So sánh dữ liệu")
    table_columns = [
        (_("Tên job"), "job.job_name"),
        (_("Số điểm ghép cặp"), "matched_pairs_count"),
        (_("Mean Bias"), "mean_bias_ppm"),
        (_("RMSE"), "rmse_ppm"),
        (_("Correlation (r)"), "correlation_coefficient"),
    ]
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Nút dẫn tới báo cáo đồ họa chi tiết
        context["primary_action"] = {"label": _("Xem báo cáo tổng hợp"), "url": reverse("co2_management:comparison_report")}
        return context

class ComparisonReportView(CO2TemplateMixin, TemplateView):
    """Trang báo cáo so sánh OCO-2 vs GOSAT-2 đầy đủ:
    scatter plot, histogram phân phối bias, biểu đồ bias theo thời gian,
    và bảng thống kê chi tiết.
    """
    active_section = "comparisons"
    template_name = "co2_management/comparison_report.html"
    page_title = _("Báo cáo so sánh OCO-2 vs GOSAT-2")
    page_subtitle = _("Đánh giá chéo (cross-validation) giữa hai nguồn đo đạc vệ tinh.")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # ── Lọc theo Job (nếu có) ─────────────────────────────────────────
        job_id = self.request.GET.get('job_id')
        qs = DataComparison.objects.select_related(
            'oco2_measurement', 'gosat2_measurement', 'job'
        )
        if job_id:
            qs = qs.filter(job_id=job_id)
            context["current_job"] = AnalysisJob.objects.filter(id=job_id).first()

        # Danh sách tất cả jobs comparison để dropdown lọc
        context["comparison_jobs"] = AnalysisJob.objects.filter(
            job_type='COMPARISON', status='COMPLETED'
        ).order_by('-id')[:20]
        context["selected_job_id"] = job_id

        count = qs.count()
        context["total_pairs"] = count

        if count == 0:
            context["no_data"] = True
            return context

        try:
            import numpy as np
        except ImportError:
            context["no_numpy"] = True
            return context

        # ── Lấy dữ liệu thô ──────────────────────────────────────────────
        rows = list(qs.values(
            'xco2_difference_ppm',
            'spatial_distance_km',
            'oco2_measurement__xco2_ppm',
            'gosat2_measurement__xco2_ppm',
            'oco2_measurement__measurement_time',
        ))

        diffs      = np.array([r['xco2_difference_ppm']            for r in rows], dtype=float)
        distances  = np.array([r['spatial_distance_km']            for r in rows], dtype=float)
        oco2_vals  = np.array([r['oco2_measurement__xco2_ppm']     for r in rows], dtype=float)
        gosat2_vals= np.array([r['gosat2_measurement__xco2_ppm']   for r in rows], dtype=float)

        # ── 1. Chỉ số tổng hợp ───────────────────────────────────────────
        bias = float(np.mean(diffs))
        rmse = float(np.sqrt(np.mean(diffs ** 2)))
        std  = float(np.std(diffs))
        mae  = float(np.mean(np.abs(diffs)))
        corr = float(np.corrcoef(oco2_vals, gosat2_vals)[0, 1]) if len(oco2_vals) > 1 else 0.0
        avg_dist = float(np.mean(distances))

        context["bias"]     = round(bias, 4)
        context["rmse"]     = round(rmse, 4)
        context["std"]      = round(std, 4)
        context["mae"]      = round(mae, 4)
        context["corr"]     = round(corr, 4)
        context["avg_dist"] = round(avg_dist, 2)
        context["outlier_pct"] = round(
            float(np.sum(np.abs(diffs) > 3 * std) / len(diffs) * 100), 1
        ) if std > 0 else 0

        # ── 2. Scatter Plot OCO-2 vs GOSAT-2 (tối đa 1500 điểm) ──────────
        n_scatter = min(1500, len(oco2_vals))
        idx = np.random.choice(len(oco2_vals), n_scatter, replace=False) if len(oco2_vals) > n_scatter else np.arange(len(oco2_vals))
        context["scatter_data_json"] = json.dumps([
            {"x": round(float(oco2_vals[i]), 3), "y": round(float(gosat2_vals[i]), 3)}
            for i in idx
        ])

        # ── 3. Histogram phân phối Bias (30 bins) ────────────────────────
        hist_counts, bin_edges = np.histogram(diffs, bins=30)
        context["bias_hist_json"] = json.dumps({
            "labels": [round(float(b), 3) for b in bin_edges[:-1]],
            "counts": [int(c) for c in hist_counts],
        })

        # ── 4. Bias theo khoảng cách không gian (5 nhóm) ─────────────────
        dist_bins = [0, 10, 20, 30, 40, 50]
        dist_labels = ['0-10 km', '10-20 km', '20-30 km', '30-40 km', '40-50 km']
        dist_bias, dist_count = [], []
        for lo, hi in zip(dist_bins[:-1], dist_bins[1:]):
            mask = (distances >= lo) & (distances < hi)
            dist_bias.append(round(float(np.mean(diffs[mask])), 4) if mask.sum() > 0 else 0)
            dist_count.append(int(mask.sum()))
        context["dist_analysis_json"] = json.dumps({
            "labels": dist_labels,
            "bias":   dist_bias,
            "count":  dist_count,
        })

        # ── 5. Bias theo tháng (trend) ────────────────────────────────────
        monthly_map = {}
        for r in rows:
            t = r['oco2_measurement__measurement_time']
            if t:
                key = t.strftime('%Y-%m') if hasattr(t, 'strftime') else str(t)[:7]
                monthly_map.setdefault(key, []).append(r['xco2_difference_ppm'])
        monthly_labels = sorted(monthly_map.keys())
        context["bias_monthly_json"] = json.dumps({
            "labels": monthly_labels,
            "bias":   [round(float(np.mean(monthly_map[k])), 4) for k in monthly_labels],
            "count":  [len(monthly_map[k]) for k in monthly_labels],
        })

        return context


class XCO2StatisticsView(CO2TemplateMixin, TemplateView):
    """
    Trang thống kê chuyên sâu về nồng độ XCO2:
    - Phân phối theo nguồn (histogram)
    - Xu hướng tháng/năm
    - Top vị trí có XCO2 cao nhất
    - Phân tích chất lượng dữ liệu
    """
    template_name = "co2_management/xco2_statistics.html"
    active_section = "statistics"
    page_title = _("Thống kê XCO2")
    page_subtitle = _("Phân tích chi tiết nồng độ CO2 từ dữ liệu vệ tinh.")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Bộ lọc tùy chọn từ URL params
        src_filter   = self.request.GET.get('source', '')   # OCO2 / GOSAT2 / ''
        year_filter  = self.request.GET.get('year', '')     # YYYY
        quality_only = self.request.GET.get('quality', '1') == '1'  # default: chỉ data tốt

        context["filter_source"]       = src_filter
        context["filter_year"]         = year_filter
        context["filter_quality_only"] = quality_only

        qs = Measurement.objects.filter(deleted_at__isnull=True)
        if quality_only:
            qs = qs.filter(xco2_quality_flag=0)
        if src_filter:
            qs = qs.filter(data_source=src_filter)
        if year_filter:
            qs = qs.filter(measurement_time__year=year_filter)

        total = qs.count()
        context["total_filtered"] = total

        if total == 0:
            context["no_data"] = True
            return context

        # ── Thống kê mô tả ────────────────────────────────────────────────
        agg = qs.aggregate(
            avg=Avg('xco2_ppm'),
            minimum=Min('xco2_ppm'),
            maximum=Max('xco2_ppm'),
            std=StdDev('xco2_ppm'),
        )
        context["desc_stats"] = {
            "avg":  round(agg['avg'],     3) if agg['avg']     else 0,
            "min":  round(agg['minimum'], 3) if agg['minimum'] else 0,
            "max":  round(agg['maximum'], 3) if agg['maximum'] else 0,
            "std":  round(agg['std'],     3) if agg['std']     else 0,
        }

        # ── Xu hướng theo tháng, phân tách theo nguồn ────────────────────
        monthly = list(
            qs.annotate(month=TruncMonth('measurement_time'))
            .values('month', 'data_source')
            .annotate(avg_xco2=Avg('xco2_ppm'), count=Count('id'))
            .order_by('month')
        )
        # Tổ chức thành cấu trúc cho Chart.js multi-dataset
        month_set = sorted({m['month'].strftime('%Y-%m') for m in monthly if m['month']})
        oco2_monthly  = {m['month'].strftime('%Y-%m'): round(m['avg_xco2'], 3)
                         for m in monthly if m['data_source'] == 'OCO2' and m['month']}
        gosat2_monthly = {m['month'].strftime('%Y-%m'): round(m['avg_xco2'], 3)
                          for m in monthly if m['data_source'] == 'GOSAT2' and m['month']}
        context["monthly_trend_json"] = json.dumps({
            "labels":  month_set,
            "oco2":   [oco2_monthly.get(m)   for m in month_set],
            "gosat2": [gosat2_monthly.get(m) for m in month_set],
        })

        # ── Phân bố theo nguồn (summary) ─────────────────────────────────
        by_source = list(
            qs.values('data_source')
            .annotate(
                count=Count('id'),
                avg=Avg('xco2_ppm'),
                minimum=Min('xco2_ppm'),
                maximum=Max('xco2_ppm'),
                std=StdDev('xco2_ppm'),
            )
        )
        context["by_source"] = [
            {
                "source":  s['data_source'],
                "count":   s['count'],
                "avg":     round(s['avg'],     3) if s['avg']     else 0,
                "min":     round(s['minimum'], 3) if s['minimum'] else 0,
                "max":     round(s['maximum'], 3) if s['maximum'] else 0,
                "std":     round(s['std'],     3) if s['std']     else 0,
            }
            for s in by_source
        ]
        context["by_source_json"] = json.dumps([
            {"label": s['data_source'], "count": s['count']}
            for s in by_source
        ])

        # ── Phân tích chất lượng dữ liệu ─────────────────────────────────
        total_all = Measurement.objects.filter(
            deleted_at__isnull=True,
            **({'data_source': src_filter} if src_filter else {}),
        ).count()
        good = Measurement.objects.filter(
            deleted_at__isnull=True, xco2_quality_flag=0,
            **({'data_source': src_filter} if src_filter else {}),
        ).count()
        context["quality_stats"] = {
            "total":    total_all,
            "good":     good,
            "bad":      total_all - good,
            "good_pct": round(good / total_all * 100, 1) if total_all else 0,
        }
        context["quality_json"] = json.dumps({
            "good": good,
            "bad":  total_all - good,
        })

        # ── Top tháng có XCO2 trung bình cao nhất ────────────────────────
        top_months = list(
            qs.annotate(month=TruncMonth('measurement_time'))
            .values('month', 'data_source')
            .annotate(avg_xco2=Avg('xco2_ppm'), count=Count('id'))
            .order_by('-avg_xco2')[:10]
        )
        context["top_months"] = [
            {
                "month":  m['month'].strftime('%Y-%m') if m['month'] else '',
                "source": m['data_source'],
                "avg":    round(m['avg_xco2'], 3) if m['avg_xco2'] else 0,
                "count":  m['count'],
            }
            for m in top_months
        ]

        # Danh sách năm để dropdown bộ lọc
        years = list(
            Measurement.objects.filter(deleted_at__isnull=True)
            .dates('measurement_time', 'year')
            .values_list('measurement_time__year', flat=True)
            .distinct()
            .order_by('-measurement_time__year')
        )
        context["available_years"] = list(
            Measurement.objects.filter(deleted_at__isnull=True)
            .annotate(yr=TruncYear('measurement_time'))
            .values_list('yr', flat=True)
            .distinct()
            .order_by('-yr')
        )

        return context


class JobListView(CO2SearchableListView):
    """Danh sách các công việc phân tích (Xử lý file, So sánh, Thống kê)"""
    model = AnalysisJob
    active_section = "jobs"
    page_title = _("Phiên phân tích (Jobs)")
    search_fields = ["job_name"]
    table_columns = [
        (_("Tên Job"), "job_name"),
        (_("Loại"), "job_type"),
        (_("Trạng thái"), "status"),
        (_("Ngày tạo"), "created_at"),
        (_("Tiến trình"), lambda obj: f"{obj.progress_percentage}%"),
    ]
    create_url_name = "co2_management:job_create"
    detail_url_name = "co2_management:job_detail"

class JobCreateView(CO2TemplateMixin, CreateView):
    """Biểu mẫu khởi tạo một công việc phân tích dữ liệu mới"""
    model = AnalysisJob
    fields = ["job_name", "job_type", "parameters"]
    active_section = "jobs"
    template_name = "co2_management/job_form.html"
    page_title = _("Tạo phiên phân tích")

    def form_valid(self, form):
        # Tự động gán người tạo là người dùng hiện tại
        form.instance.user = self.request.user
        response = super().form_valid(form)
        
        # Kích hoạt tác vụ Celery tương ứng
        from .tasks import run_comparison_task, run_analysis_job_task
        if self.object.job_type == 'COMPARISON':
            run_comparison_task.delay(self.object.pk)
            messages.info(self.request, _("Đã bắt đầu công việc so sánh dữ liệu trong nền."))
        else:
            run_analysis_job_task.delay(self.object.pk)
            messages.info(self.request, _("Đã bắt đầu phiên phân tích trong nền."))
            
        return response

    def get_success_url(self):
        return reverse("co2_management:job_list")

class JobDetailView(CO2GenericDetailView):
    """Theo dõi tiến độ và kết quả của một công việc phân tích"""
    model = AnalysisJob
    active_section = "jobs"
    template_name = "co2_management/job_detail.html"
    page_title = _("Chi tiết phiên phân tích")
    detail_fields = [
        (_("Tên"), "job_name"),
        (_("Loại"), "job_type"),
        (_("Trạng thái"), "status"),
        (_("Tiến trình"), lambda obj: f"{obj.progress_percentage}%"),
        (_("Bắt đầu"), "started_at"),
        (_("Kết thúc"), "finished_at"),
        (_("Người tạo"), "created_by.username"),
    ]

class AuditLogListView(CO2SearchableListView):
    """Xem nhật ký thay đổi hệ thống của module CO2 để phục vụ kiểm tra (audit)"""
    model = AuditLog
    active_section = "audit"
    page_title = _("Nhật ký hệ thống")
    search_fields = ["action", "model_name", "user__username"]
    table_columns = [
        (_("Thời gian"), "timestamp"),
        (_("Người dùng"), lambda obj: obj.user.username if obj.user else "System"),
        (_("Hành động"), "action"),
        (_("Mô hình"), "model_name"),
        (_("Đối tượng ID"), "object_id"),
    ]
