"""Terminal display service."""

import time

from .terminal_monitor import TerminalMonitor
from .data_fetcher import DataFetcher


def main():
    """Entry point for display service."""
    from sagrada.collector.config.settings import load_config
    from sagrada.shared.logging import setup_logging

    config = load_config()
    setup_logging(config.log_level)

    monitor = TerminalMonitor(config)

    try:
        while True:
            monitor.update_display()
            time.sleep(5)  # Update every 5 seconds
    except KeyboardInterrupt:
        pass
    finally:
        monitor.cleanup()


__all__ = ["TerminalMonitor", "DataFetcher", "main"]
