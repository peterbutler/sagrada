"""Sensor data collection service."""

from .collector import DataCollector


def main():
    """Entry point for collector service."""
    from .config.settings import load_config
    from sagrada.shared.logging import setup_logging
    from sagrada.shared.database import DBConfig

    import time

    config = load_config()
    setup_logging(config.log_level)

    db_config = DBConfig.from_env()

    collector = DataCollector(config.sensors, db_config)

    try:
        while True:
            collector.collect_and_store()
            time.sleep(config.collection_interval)
    except KeyboardInterrupt:
        pass
    finally:
        collector.storage.close()


__all__ = ["DataCollector", "main"]
