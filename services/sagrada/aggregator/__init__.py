"""Sensor readings aggregation service."""

import time
from datetime import datetime, timedelta

from .aggregator import ReadingsAggregator


def main():
    """Entry point for aggregator service."""
    from sagrada.shared.logging import setup_logging, get_logger
    from sagrada.shared.database import DBConfig

    setup_logging("INFO")
    logger = get_logger("ReadingsAggregator")

    db_config = DBConfig.from_env()
    aggregator = ReadingsAggregator(db_config)

    logger.info("Starting readings aggregator service")

    while True:
        try:
            # Calculate time range for aggregation
            # Truncate to minute boundary for consistent aggregation
            end_time = datetime.now().replace(second=0, microsecond=0)
            start_time = end_time - timedelta(minutes=5)

            logger.info(f"Aggregating data from {start_time} to {end_time}")
            rows_inserted = aggregator.aggregate(start_time, end_time)
            logger.info(f"Inserted {rows_inserted} aggregated records")

        except Exception as e:
            logger.error(f"Aggregation cycle failed: {e}")

        # Wait until the next minute
        next_minute = (datetime.now() + timedelta(minutes=1)).replace(
            second=0, microsecond=0
        )
        sleep_seconds = (next_minute - datetime.now()).total_seconds()
        time.sleep(sleep_seconds)


__all__ = ["ReadingsAggregator", "main"]
