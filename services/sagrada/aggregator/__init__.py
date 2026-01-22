"""Sensor readings aggregation service."""

import os
import time
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

from .aggregator import ReadingsAggregator

# Default retention: 24 hours of raw sensor data
DEFAULT_RETENTION_HOURS = 24


def main():
    """Entry point for aggregator service."""
    from sagrada.shared.logging import setup_logging, get_logger
    from sagrada.shared.database import DBConfig

    # Load environment variables from config directory
    repo_root = Path(__file__).parent.parent.parent.parent
    env_path = repo_root / "config" / ".env"
    load_dotenv(env_path)

    setup_logging("INFO")
    logger = get_logger("ReadingsAggregator")

    db_config = DBConfig.from_env()
    aggregator = ReadingsAggregator(db_config)

    # Configurable retention period for raw sensor_readings
    retention_hours = int(os.environ.get("SENSOR_RETENTION_HOURS", DEFAULT_RETENTION_HOURS))

    logger.info(f"Starting readings aggregator service (retention: {retention_hours}h)")

    while True:
        now = datetime.now()

        try:
            # Calculate time range for aggregation
            # Truncate to minute boundary for consistent aggregation
            end_time = now.replace(second=0, microsecond=0)
            start_time = end_time - timedelta(minutes=5)

            logger.info(f"Aggregating data from {start_time} to {end_time}")
            rows_inserted = aggregator.aggregate(start_time, end_time)
            logger.info(f"Inserted {rows_inserted} aggregated records")

            # Cleanup old sensor_readings once per hour (at minute 0)
            if now.minute == 0:
                try:
                    aggregator.cleanup_old_readings(retention_hours)
                except Exception as e:
                    logger.error(f"Cleanup failed: {e}")

        except Exception as e:
            logger.error(f"Aggregation cycle failed: {e}")

        # Wait until the next minute
        next_minute = (datetime.now() + timedelta(minutes=1)).replace(
            second=0, microsecond=0
        )
        sleep_seconds = (next_minute - datetime.now()).total_seconds()
        time.sleep(sleep_seconds)


__all__ = ["ReadingsAggregator", "main"]
