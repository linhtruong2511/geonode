from django import forms
from django.core.exceptions import ValidationError
from django.forms import BaseInlineFormSet, inlineformset_factory
from django.utils.translation import gettext_lazy as _

from geonode.layers.models import Dataset

from .models import (
    BoundaryPoint,
    CoordinateSystem,
    District,
    MineralType,
    MiningDetectionJob,
    MiningSite,
    MonitoringRecord,
    PlanningZone,
    Province,
    Violation,
    Ward,
)


class BootstrapFormMixin:
    text_input_classes = (
        forms.TextInput,
        forms.NumberInput,
        forms.DateInput,
        forms.DateTimeInput,
        forms.Select,
        forms.Textarea,
    )

    def _apply_bootstrap(self):
        for name, field in self.fields.items():
            widget = field.widget
            css_class = widget.attrs.get("class", "")
            if isinstance(widget, forms.CheckboxInput):
                widget.attrs["class"] = f"{css_class} form-check-input".strip()
                continue
            if isinstance(widget, self.text_input_classes):
                widget.attrs["class"] = f"{css_class} form-control".strip()
            if isinstance(widget, forms.Textarea):
                widget.attrs.setdefault("rows", 3)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._apply_bootstrap()


class SimpleModelForm(BootstrapFormMixin, forms.ModelForm):
    pass


class MineralTypeForm(SimpleModelForm):
    class Meta:
        model = MineralType
        fields = ["code", "name", "description"]
        labels = {
            "code": _("Mã loại khoáng sản"),
            "name": _("Tên loại khoáng sản"),
            "description": _("Mô tả"),
        }

class CoordinateSystemForm(SimpleModelForm):
    class Meta:
        model = CoordinateSystem
        fields = ["name", "central_meridian", "projection_zone", "description"]
        labels = {
            "name": _("Tên hệ tọa độ"),
            "central_meridian": _("Kinh tuyến trục"),
            "projection_zone": _("Múi chiếu"),
            "description": _("Mô tả"),
        }

class ProvinceForm(SimpleModelForm):
    class Meta:
        model = Province
        fields = ["code", "name"]
        labels = {"code": _("Mã tỉnh/thành phố"), "name": _("Tên tỉnh/thành phố")}

class DistrictForm(SimpleModelForm):
    class Meta:
        model = District
        fields = ["province", "code", "name"]
        labels = {
            "province": _("Tỉnh/Thành phố"),
            "code": _("Mã quận/huyện"),
            "name": _("Tên quận/huyện"),
        }

class WardForm(SimpleModelForm):
    class Meta:
        model = Ward
        fields = ["district", "code", "name"]
        labels = {
            "district": _("Quận/Huyện"),
            "code": _("Mã xã/phường"),
            "name": _("Tên xã/phường"),
        }

class PlanningZoneForm(SimpleModelForm):
    class Meta:
        model = PlanningZone
        fields = ["code", "approved_date", "document_reference", "description"]
        labels = {
            "code": _("Mã vùng quy hoạch"),
            "approved_date": _("Ngày phê duyệt"),
            "document_reference": _("Số hiệu văn bản/Quyết định"),
            "description": _("Ghi chú quy hoạch"),
        }

class MiningSiteForm(SimpleModelForm):
    class Meta:
        model = MiningSite
        fields = [
            "serial_number", "name", "mineral_type", "ward",
            "location_description", "area_ha", "estimated_reserve_m3",
            "planning_zone", "coordinate_system", "status", "notes",
        ]
        labels = {
            "serial_number": _("Số hiệu điểm mỏ"),
            "name": _("Tên điểm mỏ"),
            "mineral_type": _("Loại khoáng sản"),
            "ward": _("Xã/Phường"),
            "location_description": _("Mô tả vị trí"),
            "area_ha": _("Diện tích (ha)"),
            "estimated_reserve_m3": _("Trữ lượng ước tính (m³)"),
            "planning_zone": _("Thuộc vùng quy hoạch"),
            "coordinate_system": _("Hệ tọa độ"),
            "status": _("Trạng thái hoạt động"),
            "notes": _("Ghi chú thêm"),
        }


class BoundaryPointForm(SimpleModelForm):
    class Meta:
        model = BoundaryPoint
        fields = ["point_order", "x", "y", "latitude", "longitude"]
        labels = {
            "point_order": _("Thứ tự điểm"),
            "x": _("Tọa độ X"),
            "y": _("Tọa độ Y"),
            "latitude": _("Vĩ độ (Lat)"),
            "longitude": _("Kinh độ (Lng)"),
        }


class BaseBoundaryPointFormSet(BaseInlineFormSet):
    def clean(self):
        super().clean()
        valid_forms = []
        for form in self.forms:
            if not hasattr(form, "cleaned_data"):
                continue
            if form.cleaned_data.get("DELETE"):
                continue
            if not any(
                form.cleaned_data.get(field) not in (None, "")
                for field in ["x", "y", "latitude", "longitude"]
            ):
                continue

            x = form.cleaned_data.get("x")
            y = form.cleaned_data.get("y")
            lat = form.cleaned_data.get("latitude")
            lng = form.cleaned_data.get("longitude")

            if (x is None) ^ (y is None):
                form.add_error("x", _("X/Y must be provided as a complete pair."))
                form.add_error("y", _("X/Y must be provided as a complete pair."))
            if (lat is None) ^ (lng is None):
                form.add_error("latitude", _("Latitude/longitude must be provided as a complete pair."))
                form.add_error("longitude", _("Latitude/longitude must be provided as a complete pair."))
            if (x is None or y is None) and (lat is None or lng is None):
                raise ValidationError(
                    _("Each boundary point must include either X/Y or latitude/longitude.")
                )
            valid_forms.append(form)

        if len(valid_forms) < 3:
            raise ValidationError(_("A mining site needs at least 3 valid boundary points."))


BoundaryPointFormSet = inlineformset_factory(
    MiningSite,
    BoundaryPoint,
    form=BoundaryPointForm,
    formset=BaseBoundaryPointFormSet,
    extra=3,
    can_delete=True,
)


class AutoMonitoringSetupForm(BootstrapFormMixin, forms.Form):
    date_from = forms.DateField(
        label=_("Từ ngày"),
        widget=forms.DateInput(attrs={"type": "date"}),
        help_text=_("Ngày bắt đầu lấy ảnh cho lần tải đầu tiên."),
    )
    date_to = forms.DateField(
        label=_("Đến ngày"),
        widget=forms.DateInput(attrs={"type": "date"}),
        help_text=_("Ngày kết thúc lấy ảnh cho lần tải đầu tiên."),
    )
    max_cloud = forms.IntegerField(
        label=_("Ngưỡng mây tối đa (%)"),
        min_value=0,
        max_value=100,
        help_text=_("Giá trị này sẽ được lưu để dùng cho các lần tải ảnh tự động tiếp theo."),
    )

    def __init__(self, *args, site=None, **kwargs):
        self.site = site
        super().__init__(*args, **kwargs)

    def clean(self):
        cleaned_data = super().clean()
        date_from = cleaned_data.get("date_from")
        date_to = cleaned_data.get("date_to")

        if date_from and date_to and date_from > date_to:
            raise ValidationError(_("Ngày bắt đầu không được lớn hơn ngày kết thúc."))

        return cleaned_data


class MonitoringRecordForm(SimpleModelForm):
    class Meta:
        model = MonitoringRecord
        fields = [
            "mining_site",
            "recorded_at",
            "period_type",
            "actual_extraction_m3",
            "remaining_reserve_m3",
            "inspector",
            "violations_noted",
            "notes",
        ]
        widgets = {
            "recorded_at": forms.DateTimeInput(attrs={"type": "datetime-local"}),
        }
        labels = {
            "mining_site": _("Điểm mỏ giám sát"),
            "recorded_at": _("Thời điểm ghi nhận"),
            "period_type": _("Kỳ kiểm tra"),
            "actual_extraction_m3": _("Sản lượng khai thác thực tế (m³)"),
            "remaining_reserve_m3": _("Trữ lượng còn lại (m³)"),
            "inspector": _("Người kiểm tra/Giám sát"),
            "violations_noted": _("Phát hiện vi phạm"),
            "notes": _("Ghi chú giám sát"),
        }


class ViolationForm(SimpleModelForm):
    class Meta:
        model = Violation
        fields = [
            "monitoring_record",
            "description",
            "severity",
            "status",
            "resolved_at",
            "penalty_amount",
        ]
        widgets = {
            "resolved_at": forms.DateTimeInput(attrs={"type": "datetime-local"}),
        }
        labels = {
            "monitoring_record": _("Bản ghi giám sát liên quan"),
            "description": _("Mô tả vi phạm"),
            "severity": _("Mức độ nghiêm trọng"),
            "status": _("Trạng thái xử lý"),
            "resolved_at": _("Thời điểm khắc phục"),
            "penalty_amount": _("Số tiền xử phạt (VNĐ)"),
        }


class MiningJobBaseForm(BootstrapFormMixin, forms.ModelForm):
    model_id = forms.CharField(
        label=_("Model ID"),
        max_length=255,
        help_text=_("ID của model AI sẽ dùng cho phiên phân tích."),
    )
    coverage_id = forms.CharField(
        label=_("ID Lớp dữ liệu (Coverage)"),
        max_length=255,
        help_text=_("Tên định danh (alternate name) của lớp raster trên GeoServer/GeoNode."),
    )
    threshold = forms.FloatField(label=_("Ngưỡng nhận diện"), initial=0.57)
    min_area_m2 = forms.IntegerField(label=_("Diện tích tối thiểu (m²)"), initial=500)
    tile_size = forms.ChoiceField(
        label=_("Kích thước ô (Tile Size)"),
        choices=[(256, "256 x 256"), (512, "512 x 512"), (1024, "1024 x 1024")],
    )
    smooth = forms.BooleanField(label=_("Làm mịn kết quả"), initial=True)
    closing_radius = forms.IntegerField(label=_("Bán kính bao phủ (Closing)"), initial=5)
    simplify_tolerance = forms.IntegerField(label=_("Độ sai số đơn giản hóa (Simplify)"), initial=10)
    compute_spectral = forms.BooleanField(label=_("Tính toán chỉ số quang phổ"), initial=True)
    compute_change = forms.BooleanField(label=_("Phân tích biến động"), initial=False, required=False)
    baseline_job_id = forms.UUIDField(label=_("ID công việc làm mốc (Baseline)"), required=False)
    output_layer_name = forms.CharField(label=_("Tên lớp dữ liệu đầu ra"), max_length=128)

    class Meta:
        model = MiningDetectionJob
        fields = ["title", 
                #   "model_version", 
                #   "cloud_cover_pct", 
                #   "date_from", 
                #   "date_to"
                  ]
        widgets = {
            # "date_from": forms.DateInput(attrs={"type": "date"}),
            # "date_to": forms.DateInput(attrs={"type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        model_choices = kwargs.pop("model_choices", None)
        default_model_id = kwargs.pop("default_model_id", None)
        super().__init__(*args, **kwargs)
        self.fields["title"].widget.attrs.setdefault("placeholder", "Mining monitoring run")
        self.fields["output_layer_name"].widget.attrs.setdefault(
            "placeholder", "ai_mining_result_layer"
        )
        self.available_model_ids = {value for value, _ in model_choices or []}

        if model_choices:
            self.fields["model_id"].widget = forms.Select(choices=model_choices)
            self.fields["model_id"].choices = model_choices
            self.fields["model_id"].widget.attrs["class"] = "form-control"

        if default_model_id:
            self.initial.setdefault("model_id", default_model_id)

        if self.instance and self.instance.pk:
            extra = self.instance.extra_params or {}
            self.initial.setdefault("model_id", self.instance.model_version)
            self.initial.setdefault("coverage_id", extra.get("coverage_id", ""))
            self.initial.setdefault("threshold", extra.get("threshold", 0.57))
            self.initial.setdefault("min_area_m2", extra.get("min_area_m2", 500))
            self.initial.setdefault("tile_size", extra.get("tile_size", 512))
            self.initial.setdefault("smooth", extra.get("smooth", True))
            self.initial.setdefault("closing_radius", extra.get("closing_radius", 5))
            self.initial.setdefault("simplify_tolerance", extra.get("simplify_tolerance", 10))
            self.initial.setdefault("compute_spectral", extra.get("compute_spectral", True))
            self.initial.setdefault("compute_change", extra.get("compute_change", False))
            self.initial.setdefault("baseline_job_id", extra.get("baseline_job_id"))
            self.initial.setdefault("output_layer_name", extra.get("output_layer_name", ""))

    def clean(self):
        cleaned = super().clean()
        model_id = cleaned.get("model_id")
        date_from = cleaned.get("date_from")
        date_to = cleaned.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise forms.ValidationError(_("End date must be after start date."))
        if self.available_model_ids and model_id and model_id not in self.available_model_ids:
            self.add_error("model_id", _("Model ID không hợp lệ."))
        if cleaned.get("compute_change") and not cleaned.get("baseline_job_id"):
            self.add_error("baseline_job_id", _("Baseline job ID is required when change detection is enabled."))
        return cleaned

    def build_extra_params(self):
        params = {
            "coverage_id": self.cleaned_data["coverage_id"],
            "threshold": self.cleaned_data["threshold"],
            "min_area_m2": self.cleaned_data["min_area_m2"],
            "tile_size": int(self.cleaned_data["tile_size"]),
            "smooth": self.cleaned_data["smooth"],
            "closing_radius": self.cleaned_data["closing_radius"],
            "simplify_tolerance": self.cleaned_data["simplify_tolerance"],
            "compute_spectral": self.cleaned_data["compute_spectral"],
            "compute_change": self.cleaned_data["compute_change"],
        }
        if self.cleaned_data.get("baseline_job_id"):
            params["baseline_job_id"] = str(self.cleaned_data["baseline_job_id"])
        if self.cleaned_data.get("output_layer_name"):
            params["output_layer_name"] = self.cleaned_data["output_layer_name"]
        return params

    def get_payload(self, session_id):
        payload = self.build_extra_params()
        payload["model_id"] = self.cleaned_data["model_id"]
        payload["session_id"] = session_id
        return payload

    def save(self, commit=True):
        job = super().save(commit=False)
        job.model_version = self.cleaned_data["model_id"]
        job.extra_params = self.build_extra_params()
        coverage_id = self.cleaned_data["coverage_id"]
        job.base_dataset = Dataset.objects.filter(alternate=coverage_id).first()
        if commit:
            job.save()
        return job


class MiningJobCreateForm(MiningJobBaseForm):
    pass


class MiningJobUpdateForm(MiningJobBaseForm):
    pass
