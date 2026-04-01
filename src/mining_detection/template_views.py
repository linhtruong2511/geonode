import logging
from datetime import datetime, timezone
from urllib.parse import urlencode
from uuid import UUID

import requests
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Q
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.views import View
from django.views.generic import CreateView, DeleteView, DetailView, FormView, ListView, TemplateView, UpdateView
from django.core.paginator import Paginator
from geonode.layers.models import Dataset
from django.contrib.gis.geos import Polygon
from .forms import (
    BoundaryPointFormSet,
    CoordinateSystemForm,
    DistrictForm,
    MineralTypeForm,
    AutoMonitoringSetupForm,
    MiningJobCreateForm,
    MiningJobUpdateForm,
    MiningSiteForm,
    MonitoringRecordForm,
    PlanningZoneForm,
    ProvinceForm,
    ViolationForm,
    WardForm,
)
from .models import (
    CoordinateSystem,
    District,
    JobStatus,
    MineralType,
    MiningDetectionJob,
    MiningSite,
    MonitoringRecord,
    PlanningZone,
    Province,
    Violation,
    Ward,
)
from .services import build_model_choices, clone_job_for_retry, get_ai_model_catalog, save_job_to_db, send_analyze_job
from .tasks import sync_job
from .tasks_utils import send_download_mining_site_job

logger = logging.getLogger(__name__)

AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://ai-api:8001")


def app_sections():
    reference_items = [
        {"label": _("Loại khoáng sản"),  "url": reverse("mining_detection:reference_mineral_types_list")},
        {"label": _("Hệ tọa độ"),        "url": reverse("mining_detection:reference_coordinate_systems_list")},
        {"label": _("Tỉnh/Thành phố"),   "url": reverse("mining_detection:reference_provinces_list")},
        {"label": _("Quận/Huyện"),        "url": reverse("mining_detection:reference_districts_list")},
        {"label": _("Xã/Phường"),         "url": reverse("mining_detection:reference_wards_list")},
        {"label": _("Khu quy hoạch"),     "url": reverse("mining_detection:reference_planning_zones_list")},
    ]
    return [
        {"label": _("Tổng quan"),      "url": reverse("mining_detection:dashboard"),         "key": "dashboard"},
        {"label": _("Danh mục"),       "url": "#",                                           "key": "reference", "children": reference_items},
        {"label": _("Mỏ khai thác"),   "url": reverse("mining_detection:site_list"),         "key": "sites"},
        {"label": _("Giám sát"),       "url": reverse("mining_detection:monitoring_list"),   "key": "monitoring"},
        {"label": _("Vi phạm"),        "url": reverse("mining_detection:violation_list"),    "key": "violations"},
        {"label": _("Phiên phân tích"),"url": reverse("mining_detection:job_list"),          "key": "jobs"},
    ]


def resolve_attr(obj, accessor):
    value = obj
    for part in accessor.split("."):
        value = getattr(value, part, None)
        if callable(value):
            value = value()
        if value is None:
            break
    return value


class MiningTemplateMixin(LoginRequiredMixin):
    active_section = "dashboard"
    page_title = ""
    page_subtitle = ""
    page_id = "gn-mining-page"
    primary_action = None

    def get_context_data(self, **kwargs):
        try:
            context = super().get_context_data(**kwargs)
        except AttributeError:
            context = {}
            context.update(kwargs)
        context["app_sections"] = app_sections()
        context["active_section"] = self.active_section
        context["page_title"] = self.page_title
        context["page_subtitle"] = self.page_subtitle
        context["page_id"] = self.page_id
        context["primary_action"] = self.primary_action
        return context


class SearchableListView(MiningTemplateMixin, ListView):
    template_name = "mining_detection/crud_list.html"
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


class GenericDetailTemplateView(MiningTemplateMixin, DetailView):
    template_name = "mining_detection/crud_detail.html"
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
        context["edit_url"] = reverse(self.edit_url_name, kwargs={"pk": self.object.pk}) if self.edit_url_name else None
        context["delete_url"] = (
            reverse(self.delete_url_name, kwargs={"pk": self.object.pk}) if self.delete_url_name else None
        )
        return context


class GenericFormTemplateView(MiningTemplateMixin):
    template_name = "mining_detection/crud_form.html"
    submit_label = _("Lưu")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["submit_label"] = getattr(self, "submit_label", _("Lưu"))
        context["cancel_url"] = getattr(self, "cancel_url", None)
        return context


class GenericDeleteTemplateView(MiningTemplateMixin, DeleteView):
    template_name = "mining_detection/crud_confirm_delete.html"
    cancel_url_name = None

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if self.cancel_url_name:
            context["cancel_url"] = reverse(self.cancel_url_name, kwargs={"pk": self.object.pk})
        return context


class ReferenceListView(SearchableListView):
    active_section = "reference"
    detail_url_name = None
    edit_url_name = None
    delete_url_name = None


class ReferenceDetailView(GenericDetailTemplateView):
    active_section = "reference"


class ReferenceCreateView(GenericFormTemplateView, CreateView):
    active_section = "reference"
    success_url_name = None

    def get_success_url(self):
        return reverse(self.success_url_name)


class ReferenceUpdateView(GenericFormTemplateView, UpdateView):
    active_section = "reference"
    success_url_name = None

    def get_success_url(self):
        return reverse(self.success_url_name, kwargs={"pk": self.object.pk})


class ReferenceDeleteView(GenericDeleteTemplateView):
    active_section = "reference"
    success_url_name = None

    def get_success_url(self):
        return reverse(self.success_url_name)


class DashboardView(MiningTemplateMixin, TemplateView):
    template_name = "mining_detection/dashboard.html"
    page_id = "gn-mining-dashboard"
    page_title = _("Bảng điều khiển giám sát khai thác")
    page_subtitle = _("Tổng quan danh mục, mỏ khai thác, giám sát, vi phạm và các phiên phân tích AI.")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        jobs_qs = MiningDetectionJob.objects.filter(created_by=self.request.user).select_related("statistics")
        sites_qs = MiningSite.objects.select_related("mineral_type", "ward")
        monitoring_qs = MonitoringRecord.objects.select_related("mining_site")
        violation_qs = Violation.objects.select_related("monitoring_record", "monitoring_record__mining_site")
        context["stats"] = {
            "reference_total": sum(
                model.objects.count()
                for model in [MineralType, CoordinateSystem, Province, District, Ward, PlanningZone]
            ),
            "sites_total": sites_qs.count(),
            "monitoring_total": monitoring_qs.count(),
            "violations_open": violation_qs.exclude(status=Violation.StatusChoices.CLOSED).count(),
            "jobs_total": jobs_qs.count(),
            "jobs_running": jobs_qs.filter(status__in=[JobStatus.PENDING, JobStatus.RUNNING]).count(),
        }
        context["recent_sites"] = sites_qs[:5]
        context["recent_monitoring"] = monitoring_qs[:5]
        context["recent_violations"] = violation_qs[:5]
        context["recent_jobs"] = jobs_qs[:5]
        return context


class MiningSiteListView(SearchableListView):
    model = MiningSite
    active_section = "sites"
    page_id = "gn-mining-site-list"
    page_title = _("Mỏ khai thác")
    page_subtitle = _("Quản lý danh mục mỏ và ranh giới không gian.")
    search_fields = ["name", "location_description", "mineral_type__name"]
    table_columns = [
        (_("Số hiệu"), "serial_number"),
        (_("Tên mỏ"), "name"),
        (_("Khoáng sản"), "mineral_type.name"),
        (_("Trạng thái"), "get_status_display"),
        (_("Diện tích (ha)"), lambda obj: obj.area_ha),
        (_("Xã/Phường"), lambda obj: obj.ward.name if obj.ward else "-"),
    ]
    create_url_name = "mining_detection:site_create"
    detail_url_name = "mining_detection:site_detail"
    edit_url_name = "mining_detection:site_update"
    delete_url_name = "mining_detection:site_delete"

    def get_queryset(self):
        return super().get_queryset().select_related("mineral_type", "ward", "planning_zone", "coordinate_system")


class BaseSiteFormView(MiningTemplateMixin, View):
    template_name = "mining_detection/site_form.html"
    active_section = "sites"
    page_id = "gn-mining-site-form"
    page_title = _("Mỏ khai thác")
    submit_label = _("Lưu mỏ khai thác")
    object = None

    def get_object(self):
        if self.kwargs.get("pk"):
            return get_object_or_404(MiningSite, pk=self.kwargs["pk"])
        return None

    def get(self, request, *args, **kwargs):
        self.object = self.get_object()
        form = MiningSiteForm(instance=self.object)
        formset = BoundaryPointFormSet(instance=self.object or MiningSite())
        return self.render(form, formset)

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        form = MiningSiteForm(request.POST, instance=self.object)
        formset = BoundaryPointFormSet(request.POST, instance=self.object or MiningSite())
        if form.is_valid() and formset.is_valid():
            site = form.save()
            formset.instance = site
            formset.save()
            messages.success(request, _("Đã lưu thông tin mỏ khai thác thành công."))
            return redirect("mining_detection:site_detail", pk=site.pk)
        return self.render(form, formset)

    def render(self, form, formset):
        context = self.get_context_data(form=form, formset=formset, object=self.object)
        context["submit_label"] = self.submit_label
        context["datasets"] = Dataset.objects.filter(subtype="vector").order_by("-created")[:6]
        return self.response_class(request=self.request, template=self.template_name, context=context)

    def response_class(self, request, template, context):
        from django.shortcuts import render

        return render(request, template, context)


class MiningSiteCreateView(BaseSiteFormView):
    page_id = "gn-mining-site-create"
    page_title = _("Tạo mỏ khai thác")
    page_subtitle = _("Nhập thông tin mỏ và vẽ hoặc chỉnh sửa ranh giới WGS84.")


class MiningSiteUpdateView(BaseSiteFormView):
    page_id = "gn-mining-site-update"
    page_title = _("Cập nhật mỏ khai thác")
    page_subtitle = _("Chỉnh sửa thông tin mỏ và duy trì ranh giới không gian.")


class MiningSiteDetailView(MiningTemplateMixin, DetailView):
    model = MiningSite
    active_section = "sites"
    template_name = "mining_detection/site_detail.html"
    page_id = "gn-mining-site-detail"
    page_title = _("Chi tiết mỏ khai thác")

    def get_queryset(self):
        return MiningSite.objects.select_related(
            "mineral_type",
            "ward",
            "ward__district",
            "ward__district__province",
            "planning_zone",
            "coordinate_system",
        ).prefetch_related("boundary_points", "monitoring_records", "monitoring_records__violations")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        site = self.object
        boundary_points = list(site.boundary_points.all())
        monitoring_datasets = site.monitoring_datasets.all().order_by("-created")
        dataset_paginator = Paginator(monitoring_datasets, 5)
        dataset_page_number = self.request.GET.get("dataset_page") or 1
        dataset_page_obj = dataset_paginator.get_page(dataset_page_number)
        context["boundary_points"] = boundary_points
        context["map_points"] = [
            point for point in boundary_points if point.latitude is not None and point.longitude is not None
        ]
        context["has_map_points"] = bool(context["map_points"])
        context["monitoring_records"] = site.monitoring_records.all()[:10]
        context["violations"] = Violation.objects.filter(monitoring_record__mining_site=site).select_related(
            "monitoring_record"
        )[:10]
        context["monitoring_datasets_page"] = dataset_page_obj
        context["edit_url"] = reverse("mining_detection:site_update", kwargs={"pk": site.pk})
        context["delete_url"] = reverse("mining_detection:site_delete", kwargs={"pk": site.pk})
        return context


class AutoMonitoringSetupView(GenericFormTemplateView, FormView):
    form_class = AutoMonitoringSetupForm
    active_section = "sites"
    template_name = "mining_detection/site_auto_monitoring_form.html"
    page_id = "gn-mining-site-auto-monitoring"
    page_title = _("Thiết lập giám sát tự động")

    def dispatch(self, request, *args, **kwargs):
        self.site = get_object_or_404(MiningSite, pk=self.kwargs["pk"])
        return super().dispatch(request, *args, **kwargs)

    def get_initial(self):
        initial = super().get_initial()
        initial["date_from"] = self.site.created_at.date()
        initial["date_to"] = datetime.now(timezone.utc).date()
        initial["max_cloud"] = self.site.monitoring_dataset_cloud_cover
        return initial

    def get_submit_label(self):
        if self.site.is_auto_monitoring:
            return _("Cập nhật giám sát tự động")
        return _("Lưu và bật giám sát tự động")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["site"] = self.site
        return kwargs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        latlon_bounds = self.site.get_latlon_bounds()
        context["site"] = self.site
        context["latlon_bounds"] = latlon_bounds
        context["has_valid_bounds"] = bool(latlon_bounds and all(value is not None for value in latlon_bounds.values()))
        context["cancel_url"] = reverse("mining_detection:site_detail", kwargs={"pk": self.site.pk})
        context["submit_label"] = self.get_submit_label()
        return context

    def post(self, request, *args, **kwargs):
        self.site = get_object_or_404(MiningSite, pk=self.kwargs["pk"])
        if request.POST.get("action") == "disable":
            self.site.is_auto_monitoring = False
            self.site.save(update_fields=["is_auto_monitoring", "updated_at"])
            messages.success(request, _("Đã tắt giám sát tự động cho mỏ này."))
            return redirect(self.get_success_url())
        return super().post(request, *args, **kwargs)

    def form_valid(self, form):
        latlon_bounds = self.site.get_latlon_bounds()
        if not latlon_bounds or any(value is None for value in latlon_bounds.values()):
            form.add_error(None, _("Mỏ này chưa có đủ tọa độ WGS84 để thiết lập tải ảnh tự động."))
            return self.form_invalid(form)

        was_auto_monitoring = self.site.is_auto_monitoring
        self.site.is_auto_monitoring = True
        self.site.monitoring_dataset_cloud_cover = form.cleaned_data["max_cloud"]
        self.site.save(update_fields=["is_auto_monitoring", "monitoring_dataset_cloud_cover", "updated_at"])

        send_download_mining_site_job(
            [self.site],
            self.request.user.pk,
            date_from=form.cleaned_data["date_from"],
            date_to=form.cleaned_data["date_to"],
            max_cloud=form.cleaned_data["max_cloud"],
        )
        if was_auto_monitoring:
            messages.success(self.request, _("Đã cập nhật cấu hình giám sát tự động và gửi yêu cầu tải ảnh mới."))
        else:
            messages.success(self.request, _("Đã bật giám sát tự động và gửi yêu cầu tải ảnh đầu tiên."))
        return super().form_valid(form)

    def get_success_url(self):
        return reverse("mining_detection:site_detail", kwargs={"pk": self.site.pk})


class MiningSiteDeleteView(GenericDeleteTemplateView):
    model = MiningSite
    active_section = "sites"
    page_id = "gn-mining-site-delete"
    page_title = _("Xóa mỏ khai thác")
    cancel_url_name = "mining_detection:site_detail"
    success_url_name = "mining_detection:site_list"

    def get_success_url(self):
        return reverse(self.success_url_name)


class MonitoringListView(SearchableListView):
    model = MonitoringRecord
    active_section = "monitoring"
    page_id = "gn-mining-monitoring-list"
    page_title = _("Đợt giám sát")
    page_subtitle = _("Theo dõi hoạt động khai thác, trữ lượng và nhật ký kiểm tra.")
    search_fields = ["mining_site__name", "inspector", "notes"]
    table_columns = [
        (_("Mỏ khai thác"), "mining_site.name"),
        (_("Thời điểm ghi nhận"), lambda obj: obj.recorded_at.strftime("%Y-%m-%d %H:%M")),
        (_("Chu kỳ"), "get_period_type_display"),
        (_("Người kiểm tra"), lambda obj: obj.inspector or "-"),
        (_("Số vi phạm"), lambda obj: obj.violations.count()),
    ]
    create_url_name = "mining_detection:monitoring_create"
    detail_url_name = "mining_detection:monitoring_detail"
    edit_url_name = "mining_detection:monitoring_update"
    delete_url_name = "mining_detection:monitoring_delete"

    def get_queryset(self):
        queryset = super().get_queryset().select_related("mining_site").prefetch_related("violations")
        site_pk = self.request.GET.get("site")
        if site_pk:
            queryset = queryset.filter(mining_site_id=site_pk)
        return queryset


class MonitoringCreateView(GenericFormTemplateView, CreateView):
    model = MonitoringRecord
    form_class = MonitoringRecordForm
    active_section = "monitoring"
    page_id = "gn-mining-monitoring-create"
    page_title = _("Tạo đợt giám sát")
    submit_label = _("Lưu đợt giám sát")

    def get_initial(self):
        initial = super().get_initial()
        if self.request.GET.get("site"):
            initial["mining_site"] = self.request.GET["site"]
        return initial

    def get_success_url(self):
        return reverse("mining_detection:monitoring_detail", kwargs={"pk": self.object.pk})


class MonitoringUpdateView(GenericFormTemplateView, UpdateView):
    model = MonitoringRecord
    form_class = MonitoringRecordForm
    active_section = "monitoring"
    page_id = "gn-mining-monitoring-update"
    page_title = _("Cập nhật đợt giám sát")
    submit_label = _("Cập nhật đợt giám sát")

    def get_success_url(self):
        return reverse("mining_detection:monitoring_detail", kwargs={"pk": self.object.pk})


class MonitoringDetailView(GenericDetailTemplateView):
    model = MonitoringRecord
    active_section = "monitoring"
    page_id = "gn-mining-monitoring-detail"
    page_title = _("Chi tiết đợt giám sát")
    detail_fields = [
        (_("Mỏ khai thác"), "mining_site.name"),
        (_("Thời điểm ghi nhận"), lambda obj: obj.recorded_at.strftime("%Y-%m-%d %H:%M")),
        (_("Chu kỳ"), "get_period_type_display"),
        (_("Sản lượng thực tế (m3)"), "actual_extraction_m3"),
        (_("Trữ lượng còn lại (m3)"), "remaining_reserve_m3"),
        (_("Người kiểm tra"), lambda obj: obj.inspector or "-"),
        (_("Có ghi nhận vi phạm"), lambda obj: _("Có") if obj.violations_noted else _("Không")),
        (_("Ghi chú"), lambda obj: obj.notes or "-"),
    ]
    edit_url_name = "mining_detection:monitoring_update"
    delete_url_name = "mining_detection:monitoring_delete"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["violations"] = self.object.violations.all()
        context["create_violation_url"] = (
            reverse("mining_detection:violation_create") + "?" + urlencode({"monitoring": self.object.pk})
        )
        return context


class MonitoringDeleteView(GenericDeleteTemplateView):
    model = MonitoringRecord
    active_section = "monitoring"
    page_id = "gn-mining-monitoring-delete"
    page_title = _("Xóa đợt giám sát")
    cancel_url_name = "mining_detection:monitoring_detail"

    def get_success_url(self):
        return reverse("mining_detection:monitoring_list")


class ViolationListView(SearchableListView):
    model = Violation
    active_section = "violations"
    page_id = "gn-mining-violation-list"
    page_title = _("Vi phạm")
    page_subtitle = _("Rà soát và quản lý các vi phạm đang mở, đã xử lý và đã đóng.")
    search_fields = ["description", "monitoring_record__mining_site__name"]
    table_columns = [
        (_("Mỏ khai thác"), "monitoring_record.mining_site.name"),
        (_("Mức độ"), "get_severity_display"),
        (_("Trạng thái"), "get_status_display"),
        (_("Mức phạt (VND)"), lambda obj: obj.penalty_amount or "-"),
        (_("Ngày tạo"), lambda obj: obj.created_at.strftime("%Y-%m-%d %H:%M")),
    ]
    create_url_name = "mining_detection:violation_create"
    detail_url_name = "mining_detection:violation_detail"
    edit_url_name = "mining_detection:violation_update"
    delete_url_name = "mining_detection:violation_delete"

    def get_queryset(self):
        queryset = super().get_queryset().select_related("monitoring_record", "monitoring_record__mining_site")
        site_pk = self.request.GET.get("site")
        if site_pk:
            queryset = queryset.filter(monitoring_record__mining_site_id=site_pk)
        return queryset


class ViolationCreateView(GenericFormTemplateView, CreateView):
    model = Violation
    form_class = ViolationForm
    active_section = "violations"
    page_id = "gn-mining-violation-create"
    page_title = _("Tạo vi phạm")
    submit_label = _("Lưu vi phạm")

    def get_initial(self):
        initial = super().get_initial()
        if self.request.GET.get("monitoring"):
            initial["monitoring_record"] = self.request.GET["monitoring"]
        return initial

    def get_success_url(self):
        return reverse("mining_detection:violation_detail", kwargs={"pk": self.object.pk})


class ViolationUpdateView(GenericFormTemplateView, UpdateView):
    model = Violation
    form_class = ViolationForm
    active_section = "violations"
    page_id = "gn-mining-violation-update"
    page_title = _("Cập nhật vi phạm")
    submit_label = _("Cập nhật vi phạm")

    def get_success_url(self):
        return reverse("mining_detection:violation_detail", kwargs={"pk": self.object.pk})


class ViolationDetailView(GenericDetailTemplateView):
    model = Violation
    active_section = "violations"
    page_id = "gn-mining-violation-detail"
    page_title = _("Chi tiết vi phạm")
    detail_fields = [
        (_("Mỏ khai thác"), "monitoring_record.mining_site.name"),
        (_("Đợt giám sát"), lambda obj: obj.monitoring_record.recorded_at.strftime("%Y-%m-%d %H:%M")),
        (_("Mô tả"), "description"),
        (_("Mức độ"), "get_severity_display"),
        (_("Trạng thái"), "get_status_display"),
        (_("Thời điểm xử lý"), lambda obj: obj.resolved_at.strftime("%Y-%m-%d %H:%M") if obj.resolved_at else "-"),
        (_("Mức phạt"), lambda obj: obj.penalty_amount or "-"),
    ]
    edit_url_name = "mining_detection:violation_update"
    delete_url_name = "mining_detection:violation_delete"


class ViolationDeleteView(GenericDeleteTemplateView):
    model = Violation
    active_section = "violations"
    page_id = "gn-mining-violation-delete"
    page_title = _("Xóa vi phạm")
    cancel_url_name = "mining_detection:violation_detail"

    def get_success_url(self):
        return reverse("mining_detection:violation_list")


class JobOwnedMixin(MiningTemplateMixin):
    active_section = "jobs"

    def get_job_queryset(self):
        queryset = MiningDetectionJob.objects.select_related("statistics", "result_dataset", "base_dataset")
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(created_by=self.request.user)


class JobListView(JobOwnedMixin, SearchableListView):
    model = MiningDetectionJob
    page_id = "gn-mining-job-list"
    page_title = _("Phiên phân tích khai thác")
    page_subtitle = _("Tạo, theo dõi và quản lý các phiên phân tích AI.")
    template_name = "mining_detection/job_index.html"
    paginate_by = 10
    dataset_paginate_by = 6
    search_fields = ["title", "job_id"]
    table_columns = [
        (_("Tên phiên"), "title"),
        (_("Trạng thái"), "status"),
        (_("Diện tích (ha)"), lambda obj: obj.statistics.total_area_ha if hasattr(obj, "statistics") else "-"),
        (_("NDVI trung bình"), lambda obj: obj.statistics.avg_ndvi if hasattr(obj, "statistics") else "-"),
        (_("Số vùng"), lambda obj: obj.statistics.count if hasattr(obj, "statistics") else "-"),
        (_("Ngày tạo"), lambda obj: obj.created_at.strftime("%Y-%m-%d %H:%M")),
    ]
    create_url_name = "mining_detection:job_create"
    detail_url_name = "mining_detection:job_detail"
    edit_url_name = "mining_detection:job_update"
    delete_url_name = "mining_detection:job_delete"
    empty_message = _("Chưa có phiên phân tích nào.")

    def get_dataset_search_query(self):
        return self.request.GET.get("dataset_q", "").strip()

    def parse_dataset_search_date(self, term):
        for date_format in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(term, date_format).date()
            except ValueError:
                continue
        return None

    def get_dataset_queryset(self):
        queryset = Dataset.objects.filter(subtype="raster")
        q = self.get_dataset_search_query()
        if not q:
            return queryset.order_by("-created")

        for term in q.split():
            predicate = Q(title__icontains=term) | Q(alternate__icontains=term)
            if term.isdigit():
                predicate |= Q(pk=int(term))

            parsed_date = self.parse_dataset_search_date(term)
            if parsed_date:
                predicate |= Q(created__date=parsed_date)

            queryset = queryset.filter(predicate)

        return queryset.order_by("-created")

    def get_dataset_page_obj(self):
        paginator = Paginator(self.get_dataset_queryset(), self.dataset_paginate_by)
        return paginator.get_page(self.request.GET.get("dataset_page", 1))

    def get_selected_dataset(self):
        if hasattr(self, "_selected_dataset_cache"):
            return self._selected_dataset_cache

        dataset = None
        dataset_id = self.request.GET.get("dataset_id", "").strip()
        if dataset_id:
            try:
                dataset = Dataset.objects.filter(subtype="raster", pk=int(dataset_id)).first()
            except (TypeError, ValueError):
                dataset = None

        self._selected_dataset_cache = dataset
        return dataset

    def build_query_string(self, **overrides):
        params = {}
        for key in ("q", "status", "dataset_q", "dataset_id", "dataset_coverage", "page", "dataset_page"):
            value = self.request.GET.get(key, "")
            if value is None:
                continue
            value = str(value).strip()
            if value:
                params[key] = value

        for key, value in overrides.items():
            if value in (None, ""):
                params.pop(key, None)
            else:
                params[key] = str(value)

        return urlencode(params)

    def get_queryset(self):
        queryset = self.get_job_queryset()
        status_filter = self.request.GET.get("status")
        if status_filter in JobStatus.values:
            queryset = queryset.filter(status=status_filter)
        q = self.get_search_query()
        if q:
            predicate = Q(title__icontains=q)
            try:
                predicate |= Q(job_id=UUID(q))
            except ValueError:
                pass
            queryset = queryset.filter(predicate)
        selected_dataset = self.get_selected_dataset()
        if selected_dataset:
            queryset = queryset.filter(
                Q(base_dataset=selected_dataset) | Q(extra_params__coverage_id=selected_dataset.alternate)
            )
        return queryset.order_by("-created_at")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        qs = self.get_queryset()
        dataset_page_obj = self.get_dataset_page_obj()
        selected_dataset = self.get_selected_dataset()
        raw_dataset_id = self.request.GET.get("dataset_id", "").strip()
        context["status_choices"] = JobStatus.choices
        context["current_status"] = self.request.GET.get("status", "")
        context["jobs"] = context["object_list"]
        context["dataset_page_obj"] = dataset_page_obj
        context["dataset_search_query"] = self.get_dataset_search_query()
        context["selected_dataset"] = selected_dataset
        context["selected_dataset_coverage"] = selected_dataset.alternate if selected_dataset else ""
        context["show_dataset_advanced"] = bool(context["dataset_search_query"] or raw_dataset_id)
        context["job_pagination_query"] = self.build_query_string(page=None)
        context["dataset_pagination_query"] = self.build_query_string(dataset_page=None)
        context["stats"] = {
            "total": qs.count(),
            "completed": qs.filter(status=JobStatus.COMPLETED).count(),
            "running": qs.filter(status=JobStatus.RUNNING).count(),
            "failed": qs.filter(status=JobStatus.FAILED).count(),
        }
        return context


class JobCreateView(JobOwnedMixin, View):
    template_name = "mining_detection/job_add.html"
    page_id = "gn-mining-job-create"
    page_title = _("Tạo phiên phân tích khai thác")
    page_subtitle = _("Gửi yêu cầu phân tích mới và liên kết tới một raster dataset sẵn có.")

    def get_search_query(self):
        return self.request.GET.get("q", "").strip(), self.request.GET.get("bbox", "").strip()

    def parse_dataset_search_date(self, term):
        for date_format in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(term, date_format).date()
            except ValueError:
                continue
        return None

    def get_dataset_queryset(self):
        queryset = Dataset.objects.filter(subtype="raster")
        q, bbox = self.get_search_query()
        min_lon, min_lat, max_lon, max_lat = bbox.split(",") if bbox else (None, None, None, None)
        if all([min_lon, min_lat, max_lon, max_lat]):
            bbox_filter = Polygon.from_bbox((float(min_lon), float(min_lat), float(max_lon), float(max_lat)))
            try:
                min_lon, min_lat, max_lon, max_lat = map(float, [min_lon, min_lat, max_lon, max_lat])
                queryset = queryset.filter(bbox_polygon__intersects=bbox_filter)
            except ValueError:
                pass
        if not q:
            return queryset.order_by("-created")

        for term in q.split():
            predicate = Q(title__icontains=term) | Q(alternate__icontains=term)
            if term.isdigit():
                predicate |= Q(pk=int(term))

            parsed_date = self.parse_dataset_search_date(term)
            if parsed_date:
                predicate |= Q(created__date=parsed_date)

            queryset = queryset.filter(predicate)

        return queryset.order_by("-created")

    def get_model_catalog(self):
        return get_ai_model_catalog()

    def get_form_kwargs(self, request, data=None):
        model_catalog = self.get_model_catalog()
        return {
            "data": data,
            "model_choices": build_model_choices(model_catalog),
            "default_model_id": model_catalog.get("default_model_id"),
        }

    def get_context_data(self, **kwargs):
        context = {
            "page_id": self.page_id,
            "page_title": self.page_title,
            "page_subtitle": self.page_subtitle,
            "app_sections": app_sections(),
            "active_section": "session",
            "search_query": self.get_search_query()[0],
        }
        context.update(kwargs)
        return context

    def get_page_obj(self, request):
        paginator = Paginator(self.get_dataset_queryset(), 9)
        return paginator.get_page(request.GET.get("page", 1))

    def get(self, request):
        form = MiningJobCreateForm(**self.get_form_kwargs(request))
        page_obj = self.get_page_obj(request)
        context = self.get_context_data(form=form, page_obj=page_obj)
        return render(request, self.template_name, context)

    def post(self, request):
        form = MiningJobCreateForm(**self.get_form_kwargs(request, data=request.POST))
        page_obj = self.get_page_obj(request)

        if not form.is_valid():
            context = self.get_context_data(form=form, page_obj=page_obj)
            return render(request, self.template_name, context)

        session_id = request.session.session_key or "anonymous"
        payload = form.get_payload(session_id)
        try:
            analyze_response = send_analyze_job(payload, f"{AI_SERVICE_URL}/analyze")
        except Exception as exc:
            logger.warning("Lỗi khi gửi yêu cầu phân tích đến AI service: %s", exc)
            messages.error(request, _("Không thể gửi yêu cầu phân tích: %(error)s") % {"error": exc})
            context = self.get_context_data(form=form, page_obj=page_obj)
            return render(request, self.template_name, context)

        remote_job_id = analyze_response.get("job_id")
        if not remote_job_id:
            messages.error(
                request,
                _("AI service không trả về job_id hợp lệ: %(response)s") % {"response": analyze_response},
            )
            context = self.get_context_data(form=form, page_obj=page_obj)
            return render(request, self.template_name, context)

        job_pk = save_job_to_db(form, payload, remote_job_id, request.user)
        sync_job.delay(job_pk)
        messages.success(request, _("Đã gửi phiên phân tích thành công."))
        return redirect("mining_detection:job_detail", pk=job_pk)

    def render(self, context):
        from django.shortcuts import render

        return render(self.request, self.template_name, context)


class JobUpdateView(JobOwnedMixin, UpdateView):
    model = MiningDetectionJob
    form_class = MiningJobUpdateForm
    template_name = "mining_detection/job_form.html"
    page_id = "gn-mining-job-update"
    page_title = _("Cập nhật phiên phân tích")
    submit_label = _("Cập nhật phiên phân tích")

    def get_queryset(self):
        return self.get_job_queryset()

    def dispatch(self, request, *args, **kwargs):
        self.object = self.get_object()
        if not self.object.is_editable:
            messages.error(request, _("Chỉ có thể chỉnh sửa job ở trạng thái PENDING hoặc FAILED."))
            return redirect("mining_detection:job_detail", pk=self.object.pk)
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["app_sections"] = app_sections()
        context["active_section"] = self.active_section
        context["page_title"] = self.page_title
        context["page_id"] = self.page_id
        context["submit_label"] = self.submit_label
        return context

    def get_success_url(self):
        messages.success(self.request, _("Đã cập nhật cấu hình job thành công."))
        return reverse("mining_detection:job_detail", kwargs={"pk": self.object.pk})


class JobDetailView(JobOwnedMixin, DetailView):
    model = MiningDetectionJob
    template_name = "mining_detection/job_detail.html"
    page_id = "gn-mining-job-detail"
    page_title = _("Chi tiết phiên phân tích")
    context_object_name = "job"

    def get_queryset(self):
        return self.get_job_queryset()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        job = self.object
        context["edit_url"] = reverse("mining_detection:job_update", kwargs={"pk": job.pk}) if job.is_editable else None
        context["delete_url"] = reverse("mining_detection:job_delete", kwargs={"pk": job.pk}) if job.can_delete else None
        return context


class JobDeleteView(JobOwnedMixin, DeleteView):
    model = MiningDetectionJob
    template_name = "mining_detection/job_confirm_delete.html"
    page_id = "gn-mining-job-delete"
    page_title = _("Xóa phiên phân tích")
    context_object_name = "job"

    def get_queryset(self):
        return self.get_job_queryset()

    def dispatch(self, request, *args, **kwargs):
        self.object = self.get_object()
        if not self.object.can_delete:
            messages.error(request, _("Không thể xóa job đang ở trạng thái RUNNING."))
            return redirect("mining_detection:job_detail", pk=self.object.pk)
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["app_sections"] = app_sections()
        context["active_section"] = self.active_section
        context["page_title"] = self.page_title
        context["page_id"] = self.page_id
        context["cancel_url"] = reverse("mining_detection:job_detail", kwargs={"pk": self.object.pk})
        return context

    def get_success_url(self):
        messages.success(self.request, _("Đã xóa job thành công."))
        return reverse("mining_detection:job_list")


def job_status_api(request, pk):
    if not request.user.is_authenticated:
        raise Http404
    queryset = MiningDetectionJob.objects.select_related("statistics")
    if not request.user.is_superuser:
        queryset = queryset.filter(created_by=request.user)
    job = get_object_or_404(queryset, pk=pk)
    data = {
        "status": job.status,
        "poll_count": job.poll_count,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "error_message": job.error_message,
        "has_statistics": hasattr(job, "statistics") and job.statistics is not None,
        "shapefile_url": job.shapefile_url,
        "geonode_layer": job.geonode_layer_name,
        "message_progress": job.message_progress,
        "progress_percentage": job.progress_percentage,
    }
    if data["has_statistics"]:
        stats = job.statistics
        data["statistics"] = {
            "total_area_ha": round(stats.total_area_ha, 2),
            "count": stats.count,
            "avg_ndvi": round(stats.avg_ndvi, 3),
            "avg_ndwi": round(stats.avg_ndwi, 3),
            "avg_bsi": round(stats.avg_bsi, 3),
            "severity_label": stats.severity_label,
        }
    return JsonResponse(data)


def job_retry_view(request, pk):
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    queryset = (
        MiningDetectionJob.objects.all()
        if request.user.is_superuser
        else MiningDetectionJob.objects.filter(created_by=request.user)
    )
    job = get_object_or_404(queryset, pk=pk)
    if job.status != JobStatus.FAILED:
        messages.error(request, _("Chỉ có thể chạy lại các job FAILED."))
        return redirect("mining_detection:job_detail", pk=pk)

    payload = {
        "model_id": job.model_version,
        "coverage_id": job.extra_params.get("coverage_id", ""),
        "threshold": job.extra_params.get("threshold", 0.57),
        "min_area_m2": job.extra_params.get("min_area_m2", 500),
        "tile_size": job.extra_params.get("tile_size", 512),
        "smooth": job.extra_params.get("smooth", True),
        "closing_radius": job.extra_params.get("closing_radius", 5),
        "simplify_tolerance": job.extra_params.get("simplify_tolerance", 10),
        "compute_spectral": job.extra_params.get("compute_spectral", True),
        "compute_change": job.extra_params.get("compute_change", False),
    }
    if job.extra_params.get("baseline_job_id"):
        payload["baseline_job_id"] = job.extra_params["baseline_job_id"]
    if job.extra_params.get("output_layer_name"):
        payload["output_layer_name"] = job.extra_params["output_layer_name"]

    try:
        response = requests.post(f"{AI_SERVICE_URL}/analyze", json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        messages.error(request, _("Chạy lại job thất bại: %(error)s") % {"error": exc})
        return redirect("mining_detection:job_detail", pk=pk)

    job_pk = clone_job_for_retry(job, payload, data.get("job_id"))
    sync_job.apply_async(args=[job_pk], countdown=5)
    messages.success(request, _("Đã gửi yêu cầu chạy lại job thành công."))
    return redirect("mining_detection:job_detail", pk=job_pk)
