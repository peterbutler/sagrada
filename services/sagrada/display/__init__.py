"""Terminal display service."""

from .terminal_monitor import TerminalMonitor
from .data_fetcher import DataFetcher


def main():
    """Entry point for display service."""
    from sagrada.collector.config.settings import load_config
    from sagrada.shared.logging import setup_logging
    from sagrada.shared.database import DBConfig, ReadingsStorage

    config = load_config()
    setup_logging(config.log_level)

    db_config = DBConfig.from_env()
    storage = ReadingsStorage(db_config)

    fetcher = DataFetcher(storage)
    monitor = TerminalMonitor(fetcher)

    try:
        monitor.run()
    except KeyboardInterrupt:
        pass
    finally:
        storage.close()


__all__ = ["TerminalMonitor", "DataFetcher", "main"]
