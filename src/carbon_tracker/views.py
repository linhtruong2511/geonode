from django.shortcuts import render
from django.views import View
# Create your views here.
class CarbonTrackerViewIndex(View):
    def get(self, request):
        return render(request, 'carbon_tracker/index.html')