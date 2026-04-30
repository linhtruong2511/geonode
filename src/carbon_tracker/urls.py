from django.urls import path

from .views import (
    CarbonTrackerAOISummaryAPIView,
    CarbonTrackerDataListAPIView,
    CarbonTrackerSummaryAPIView,
    CarbonTrackerTimeseriesAPIView,
    CarbonTrackerViewIndex,
)

app_name = "carbon_tracker"
urlpatterns = [
    path("", CarbonTrackerViewIndex.as_view(), name="index"),
    path("api/carbons/", CarbonTrackerDataListAPIView.as_view(), name="api_data"),
    path("api/summary/", CarbonTrackerSummaryAPIView.as_view(), name="summary"),
    path("api/timeseries/", CarbonTrackerTimeseriesAPIView.as_view(), name="timeseries"),
    path("api/aoi/summary/", CarbonTrackerAOISummaryAPIView.as_view(), name="aoi_summary"),
]
