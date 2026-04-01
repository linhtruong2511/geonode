from datetime import datetime, timezone
import logging

import requests

from .models import MiningSite

logger = logging.getLogger(__name__)


def send_download_mining_site_job(mining_sites: list[MiningSite], user_id, date_from=None, date_to=None, max_cloud=None):
    for site in mining_sites:
        latlon_bounds = site.get_latlon_bounds()
        if latlon_bounds and all(value is not None for value in latlon_bounds.values()):
            resolved_date_from = date_from or site.created_at.date()
            resolved_date_to = date_to or datetime.now(timezone.utc).date()
            resolved_cloud = max_cloud if max_cloud is not None else site.monitoring_dataset_cloud_cover
            payload = {
                "user_id": user_id,
                "min_lon": latlon_bounds["min_lon"],
                "min_lat": latlon_bounds["min_lat"],
                "max_lon": latlon_bounds["max_lon"],
                "max_lat": latlon_bounds["max_lat"],
                "date_from": resolved_date_from.isoformat(),
                "date_to": resolved_date_to.isoformat(),
                "max_cloud": resolved_cloud,
                "band": "all_bands",
                "site_id": site.id,
            }

            try:
                response = requests.get("http://ai_api:8001/sentinel2/geotiff", params=payload, timeout=30)
                response.raise_for_status()
                logger.info("Sent download job for site %s successfully.", site.id)
            except requests.RequestException as exc:
                logger.error("Failed to send download job for site %s: %s", site.id, exc)
        else:
            logger.warning("Site %s does not have valid geometry bounds.", site.id)
