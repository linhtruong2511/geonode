from django.urls import path
from .views import CarbonTrackerViewIndex
name = "carbon_tracker"

urlpatterns = [
    path("", CarbonTrackerViewIndex.as_view(), name="index"),
]