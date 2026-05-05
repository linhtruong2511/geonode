import logging
from datetime import datetime, timezone
from urllib.parse import urlencode

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Count, Q
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
    value = obj
    for part in accessor.split("."):
        value = getattr(value, part, None)
        if callable(value):
            value = value()
        if value is None:
            break
    return value


class CO2TemplateMixin(LoginRequiredMixin):
    """Base mixin to inject common CO2 UI template context"""
    active_section = "dashboard"
    page_title = ""
    page_subtitle = ""
    primary_action = None
    map_config = {}

    def get_map_config(self):
        """Override to configure map state for this view"""
        return self.map_config

    def get_context_data(self, **kwargs):
        try:
            context = super().get_context_data(**kwargs)
        except AttributeError:
            context = {}
            context.update(kwargs)
        
        context["active_section"] = self.active_section
        context["page_title"] = self.page_title
        context["page_subtitle"] = self.page_subtitle
        context["primary_action"] = self.primary_action
        context["map_config"] = self.get_map_config()
        return context


class CO2SearchableListView(CO2TemplateMixin, ListView):
    template_name = "co2_management/crud_list.html"
    paginate_by = 12
    search_fields = []
    table_columns = []
    create_url_name = None
    detail_url_name = None
    edit_url_name = None
    delete_url_name = None
    empty_message = _("Không tìm thấy bản ghi nào.")

    def get_search_query(self):
        return self.request.GET.get("q", "").strip()

    def get_queryset(self):
        queryset = super().get_queryset()
        q = self.get_search_query()
        if q and self.search_fields:
            predicate = Q()
            for field in self.search_fields:
                predicate |= Q(**{f"{field}__icontains": q})
            queryset = queryset.filter(predicate)
        return queryset

    def build_row(self, obj):
        row = []
        for label, accessor in self.table_columns:
            value = accessor(obj) if callable(accessor) else resolve_attr(obj, accessor)
            row.append({"label": label, "value": value})
        actions = []
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
        context = super().get_context_data(**kwargs)
        context["search_query"] = self.get_search_query()
        context["table_headers"] = [label for label, _ in self.table_columns]
        context["table_rows"] = [self.build_row(obj) for obj in context["object_list"]]
        context["empty_message"] = self.empty_message
        if self.create_url_name:
            context["primary_action"] = {"label": _("Tạo mới"), "url": reverse(self.create_url_name)}
        return context


class CO2GenericDetailView(CO2TemplateMixin, DetailView):
    template_name = "co2_management/crud_detail.html"
    detail_fields = []
    edit_url_name = None
    delete_url_name = None

    def get_detail_rows(self):
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


# --- Page Views ---

class DashboardView(CO2TemplateMixin, TemplateView):
    template_name = "co2_management/dashboard.html"
    active_section = "dashboard"
    page_title = _("Bảng điều khiển CO2")
    page_subtitle = _("Tổng quan hệ thống giám sát và phân tích dữ liệu XCO2.")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["stats"] = {
            "measurements_total": Measurement.objects.count(),
            "sources_total": MeasurementSource.objects.count(),
            "locations_total": MonitoringLocation.objects.count(),
            "comparisons_total": DataComparison.objects.count(),
            "jobs_total": AnalysisJob.objects.count(),
            "jobs_running": AnalysisJob.objects.filter(status__in=[JobStatus.PENDING, JobStatus.RUNNING]).count(),
        }
        context["recent_sources"] = MeasurementSource.objects.order_by("-id")[:5]
        context["recent_jobs"] = AnalysisJob.objects.order_by("-id")[:5]
        return context

    def get_map_config(self):
        # API to fetch latest 500 points for dashboard
        return {
            "center": [16.0, 107.0],
            "zoom": 5,
            # "data_url": reverse("co2_management:api_measurements_geojson") + "?limit=500"
        }


class SatelliteListView(CO2SearchableListView):
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
        context["instruments"] = self.object.instruments.all()
        return context


class SourceListView(CO2SearchableListView):
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


class MeasurementListView(CO2TemplateMixin, ListView):
    model = Measurement
    active_section = "measurements"
    template_name = "co2_management/measurement_list.html"
    page_title = _("Dữ liệu đo lường")
    paginate_by = 20

    def get_queryset(self):
        qs = Measurement.objects.select_related("source")
        
        # Advanced Filtering
        src = self.request.GET.get("source")
        if src:
            qs = qs.filter(data_source=src)
            
        q_flag = self.request.GET.get("quality")
        if q_flag == '0':
            qs = qs.filter(xco2_quality_flag=0)
            
        min_xco2 = self.request.GET.get("min_xco2")
        if min_xco2:
            qs = qs.filter(xco2_ppm__gte=float(min_xco2))
            
        max_xco2 = self.request.GET.get("max_xco2")
        if max_xco2:
            qs = qs.filter(xco2_ppm__lte=float(max_xco2))
            
        date_from = self.request.GET.get("date_from")
        if date_from:
            qs = qs.filter(measurement_time__date__gte=date_from)
            
        date_to = self.request.GET.get("date_to")
        if date_to:
            qs = qs.filter(measurement_time__date__lte=date_to)
            
        return qs.order_by("-measurement_time")


class MeasurementDetailView(CO2GenericDetailView):
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
        context["profiles"] = self.object.profiles.order_by('pressure_hpa')
        return context

    def get_map_config(self):
        return {
            "center": [self.object.latitude, self.object.longitude],
            "zoom": 12,
            # will load just this point or nearby points via API later
        }

class LocationListView(CO2SearchableListView):
    model = MonitoringLocation
    active_section = "locations"
    page_title = _("Vị trí giám sát")
    search_fields = ["name"]
    table_columns = [
        (_("Tên vị trí"), "name"),
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
    model = MonitoringLocation
    fields = ["name", "location_type", "latitude", "longitude", "radius_km"]
    active_section = "locations"
    template_name = "co2_management/location_form.html"
    page_title = _("Thêm vị trí giám sát")

    def get_success_url(self):
        return reverse("co2_management:location_list")

class LocationDetailView(CO2GenericDetailView):
    model = MonitoringLocation
    active_section = "locations"
    template_name = "co2_management/location_detail.html"
    page_title = _("Chi tiết vị trí giám sát")
    detail_fields = [
        (_("Tên"), "name"),
        (_("Loại"), "location_type"),
        (_("Vĩ độ"), "latitude"),
        (_("Kinh độ"), "longitude"),
        (_("Bán kính (km)"), "radius_km"),
    ]
    edit_url_name = "co2_management:location_update"
    delete_url_name = "co2_management:location_delete"

class LocationUpdateView(CO2TemplateMixin, UpdateView):
    model = MonitoringLocation
    fields = ["name", "location_type", "latitude", "longitude", "radius_km"]
    active_section = "locations"
    template_name = "co2_management/location_form.html"
    page_title = _("Sửa vị trí giám sát")

    def get_success_url(self):
        return reverse("co2_management:location_detail", kwargs={"pk": self.object.pk})

class LocationDeleteView(CO2TemplateMixin, DeleteView):
    model = MonitoringLocation
    active_section = "locations"
    template_name = "co2_management/crud_confirm_delete.html"
    page_title = _("Xóa vị trí giám sát")

    def get_success_url(self):
        return reverse("co2_management:location_list")


class ComparisonListView(CO2SearchableListView):
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
        context["primary_action"] = {"label": _("Xem báo cáo tổng hợp"), "url": reverse("co2_management:comparison_report")}
        return context

class ComparisonReportView(CO2TemplateMixin, TemplateView):
    active_section = "comparisons"
    template_name = "co2_management/comparison_report.html"
    page_title = _("Báo cáo so sánh dữ liệu")


class JobListView(CO2SearchableListView):
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
    model = AnalysisJob
    fields = ["job_name", "job_type", "parameters"]
    active_section = "jobs"
    template_name = "co2_management/job_form.html"
    page_title = _("Tạo phiên phân tích")

    def form_valid(self, form):
        form.instance.created_by = self.request.user
        return super().form_valid(form)

    def get_success_url(self):
        return reverse("co2_management:job_list")

class JobDetailView(CO2GenericDetailView):
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



