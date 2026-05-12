from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import TemplateView

class ReactAppView(LoginRequiredMixin, TemplateView):
    """
    View chính để chạy ứng dụng React SPA.
    Cung cấp điểm neo (mount point) và load bundle.js.
    """
    template_name = "co2_management/react_app.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["page_title"] = "CO2 Management"
        return context
