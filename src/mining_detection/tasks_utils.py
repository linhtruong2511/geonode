from datetime import datetime, timedelta, timezone
import logging

import requests
from django.conf import settings

from .models import MiningSite

logger = logging.getLogger(__name__)
AI_SERVICE_URL = getattr(settings, "AI_SERVICE_URL", "http://ai_api:8001")


def send_download_mining_site_job(
    mining_sites: list[MiningSite],
    user_id,
    date_from=None,
    date_to=None,
    max_cloud=None,
    force=False,
):
    now = datetime.now(timezone.utc)
    for site in mining_sites:
        latlon_bounds = site.get_latlon_bounds()
        if latlon_bounds and all(value is not None for value in latlon_bounds.values()):
            interval_days = max(site.auto_monitoring_interval_days or 1, 1)
            if not force and site.auto_monitoring_last_requested_at:
                elapsed_days = (now - site.auto_monitoring_last_requested_at).total_seconds() / 86400
                if elapsed_days < interval_days:
                    logger.info(
                        "Skip site %s because auto monitoring interval has not elapsed yet (%s/%s days).",
                        site.id,
                        round(elapsed_days, 2),
                        interval_days,
                    )
                    continue

            resolved_date_to = date_to or now.date()
            resolved_date_from = date_from or (resolved_date_to - timedelta(days=interval_days))
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
                response = requests.get(f"{AI_SERVICE_URL}/sentinel2/geotiff", params=payload, timeout=30)
                response.raise_for_status()
                site.auto_monitoring_last_requested_at = now
                site.save(update_fields=["auto_monitoring_last_requested_at", "updated_at"])
                logger.info("Sent download job for site %s successfully.", site.id)
            except requests.RequestException as exc:
                logger.error("Failed to send download job for site %s: %s", site.id, exc)
        else:
            logger.warning("Site %s does not have valid geometry bounds.", site.id)
