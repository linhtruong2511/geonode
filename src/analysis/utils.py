import requests
import logging
logger = logging.getLogger("analysis")
def _get_owner(request, User):
    if request.user and not request.user.is_anonymous:
        return request.user
    return User.objects.filter(is_superuser=True).first()


def _fetch_ai_result(job_id, url):
    """Returns the parsed JSON from /result/<job_id> or None on error."""
    try:
        url = f"{url}/result/{job_id}"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning(f"Could not fetch AI result for {job_id}: {e}")
    return None


def _fetch_ai_status(job_id, url):
    """Returns the parsed JSON from /status/<job_id> or None on error."""
    try:
        url = f"{url}/status/{job_id}"
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning(f"Could not fetch AI status for {job_id}: {e}")
    return None