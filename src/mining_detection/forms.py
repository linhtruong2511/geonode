"""
mining_detection/forms.py

Django Form cho việc tạo MiningDetectionJob.
Validate đầu vào trước khi gửi tới AI service.
"""

from django import forms
from django.utils.translation import gettext_lazy as _

from .models import MiningDetectionJob


class MiningJobCreateForm(forms.ModelForm):
    """
    Form tạo job phân tích — tương ứng với body của POST /analyze.
    Bao gồm cả các tham số advanced của AI service.
    """

    # ── AI service params (không phải field của model, truyền qua extra_params) ──
    coverage_id = forms.CharField(
        label=_("Coverage ID (WCS)"),
        max_length=255,
        help_text=_("Tên layer ảnh Sentinel-2 trên GeoServer WCS, VD: sentinel2:B04_B08_B11"),
        widget=forms.TextInput(attrs={"class": "form-control", "placeholder": "sentinel2:B04_B08_B11"}),
    )
    threshold = forms.FloatField(
        label=_("Ngưỡng phân loại (threshold)"),
        initial=0.57,
        min_value=0.0,
        max_value=1.0,
        help_text=_("Xác suất tối thiểu để pixel được phân loại là khai thác (0.0 – 1.0)"),
        widget=forms.NumberInput(attrs={"class": "form-control", "step": "0.01"}),
    )
    min_area_m2 = forms.IntegerField(
        label=_("Diện tích tối thiểu (m²)"),
        initial=500,
        min_value=0,
        help_text=_("Loại bỏ các vùng nhỏ hơn giá trị này (đơn vị: m²)"),
        widget=forms.NumberInput(attrs={"class": "form-control"}),
    )
    tile_size = forms.ChoiceField(
        label=_("Kích thước tile"),
        choices=[(256, "256 × 256"), (512, "512 × 512"), (1024, "1024 × 1024")],
        initial=512,
        help_text=_("Kích thước tile ảnh đầu vào cho model (pixel)"),
        widget=forms.Select(attrs={"class": "form-control"}),
    )
    smooth = forms.BooleanField(
        label=_("Làm mịn kết quả (smooth)"),
        initial=True,
        required=False,
        help_text=_("Áp dụng bộ lọc làm mịn cạnh sau phân loại"),
        widget=forms.CheckboxInput(attrs={"class": "form-check-input"}),
    )
    closing_radius = forms.IntegerField(
        label=_("Bán kính closing"),
        initial=5,
        min_value=0,
        help_text=_("Bán kính morphological closing để lấp lỗ hổng (pixel)"),
        widget=forms.NumberInput(attrs={"class": "form-control"}),
    )
    simplify_tolerance = forms.IntegerField(
        label=_("Sai số đơn giản hoá (m)"),
        initial=10,
        min_value=0,
        help_text=_("Đơn giản hoá đường viền shapefile với dung sai này (mét)"),
        widget=forms.NumberInput(attrs={"class": "form-control"}),
    )
    compute_spectral = forms.BooleanField(
        label=_("Tính chỉ số quang phổ (NDVI, NDWI, BSI)"),
        initial=True,
        required=False,
        help_text=_("Tính toán và lưu các chỉ số viễn thám cho từng vùng phát hiện"),
        widget=forms.CheckboxInput(attrs={"class": "form-check-input"}),
    )
    compute_change = forms.BooleanField(
        label=_("Phân tích biến đổi (change detection)"),
        initial=False,
        required=False,
        help_text=_("So sánh với baseline_job_id để phát hiện vùng mới/mất đi"),
        widget=forms.CheckboxInput(attrs={"class": "form-check-input"}),
    )
    baseline_job_id = forms.UUIDField(
        label=_("Baseline job ID"),
        required=False,
        help_text=_("UUID của job trước dùng làm baseline cho change detection"),
        widget=forms.TextInput(attrs={"class": "form-control", "placeholder": "Để trống nếu không dùng"}),
    )
    output_layer_name = forms.CharField(
        label=_("Tên layer kết quả"),
        max_length=128,
        required=False,
        help_text=_("Tên layer GeoNode sau khi upload (để trống = tự động tạo)"),
        widget=forms.TextInput(attrs={"class": "form-control", "placeholder": "VD: ai_mining_quangninh_q1_2024"}),
    )

    class Meta:
        model = MiningDetectionJob
        fields = ["title", 
                #   "date_from", 
                #   "date_to", 
                #   "model_version", 
                #   "cloud_cover_pct"
                ]
        widgets = {
            "title": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "VD: Quảng Ninh — Q1/2024",
            }),
            # "date_from": forms.DateInput(attrs={
            #     "class": "form-control",
            #     "type": "date",
            # }),
            # "date_to": forms.DateInput(attrs={
            #     "class": "form-control",
            #     "type": "date",
            # }),
            # "model_version": forms.Select(
            #     choices=[
            #         ("v2.1-sentinel", "v2.1 — Sentinel-2 (mặc định)"),
            #         ("v2.0-sentinel", "v2.0 — Sentinel-2 (ổn định)"),
            #         ("v1.5-sentinel", "v1.5 — Sentinel-2 (legacy)"),
            #     ],
            #     attrs={"class": "form-control"},
            # ),
            # "cloud_cover_pct": forms.NumberInput(attrs={
            #     "class": "form-control",
            #     "step": "1",
            #     "min": "0",
            #     "max": "100",
            # }),
        }
        labels = {
            "title": _("Tên phiên phân tích"),
            # "date_from": _("Từ ngày"),
            # "date_to": _("Đến ngày"),
            # "model_version": _("Phiên bản model"),
            # "cloud_cover_pct": _("Ngưỡng mây tối đa (%)"),
        }

    def clean(self):
        cleaned = super().clean()
        date_from = cleaned.get("date_from")
        date_to = cleaned.get("date_to")
        if date_from and date_to and date_from >= date_to:
            raise forms.ValidationError(_("Ngày kết thúc phải sau ngày bắt đầu."))
        # compute_change yêu cầu baseline_job_id
        if cleaned.get("compute_change") and not cleaned.get("baseline_job_id"):
            self.add_error(
                "baseline_job_id",
                _("Phải cung cấp Baseline job ID khi bật Change detection."),
            )
        return cleaned

    def get_payload(self, session_id: str) -> dict:
        """
        Tạo payload JSON để POST tới AI phân tích
        """
        cd = self.cleaned_data
        payload = {
            "coverage_id": cd["coverage_id"],
            "threshold": cd["threshold"],
            "min_area_m2": cd["min_area_m2"],
            "tile_size": int(cd["tile_size"]),
            "smooth": cd["smooth"],
            "closing_radius": cd["closing_radius"],
            "simplify_tolerance": cd["simplify_tolerance"],
            "compute_spectral": cd["compute_spectral"],
            "compute_change": cd["compute_change"],
            "session_id": session_id,
        }
        if cd.get("baseline_job_id"):
            payload["baseline_job_id"] = str(cd["baseline_job_id"])
        if cd.get("output_layer_name"):
            payload["output_layer_name"] = cd["output_layer_name"]
        return payload
