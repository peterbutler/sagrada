"""Disk space checking utility for graceful degradation.

Services can use this to check disk status before writing, preventing
cryptic MySQL errors when disk is full.
"""

import logging
import shutil

logger = logging.getLogger(__name__)

CRITICAL_THRESHOLD_PERCENT = 95


class DiskFullError(Exception):
    """Raised when disk is too full to safely write data."""

    pass


def get_disk_usage(path: str = "/") -> tuple[int, int, float]:
    """Get disk usage for the given path.

    Args:
        path: Filesystem path to check.

    Returns:
        Tuple of (used_bytes, total_bytes, percent_used)
    """
    usage = shutil.disk_usage(path)
    percent = (usage.used / usage.total) * 100
    return usage.used, usage.total, percent


def check_disk_space(
    path: str = "/", threshold: float = CRITICAL_THRESHOLD_PERCENT
) -> bool:
    """Check if disk has enough space to continue writing.

    Args:
        path: Filesystem path to check.
        threshold: Percentage threshold above which writes should stop.

    Returns:
        True if safe to write, False if disk is too full.
    """
    _, _, percent = get_disk_usage(path)
    return percent < threshold


def require_disk_space(
    path: str = "/", threshold: float = CRITICAL_THRESHOLD_PERCENT
) -> None:
    """Raise DiskFullError if disk is above threshold.

    Use this as a guard before write operations.

    Args:
        path: Filesystem path to check.
        threshold: Percentage threshold above which writes should stop.

    Raises:
        DiskFullError: If disk usage exceeds threshold.
    """
    used, total, percent = get_disk_usage(path)
    if percent >= threshold:
        used_gb = used / (1024**3)
        total_gb = total / (1024**3)
        raise DiskFullError(
            f"Disk usage critical: {percent:.1f}% ({used_gb:.1f}/{total_gb:.1f} GB). "
            f"Writes suspended until usage drops below {threshold}%."
        )
