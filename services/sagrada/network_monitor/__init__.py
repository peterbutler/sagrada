"""Network Monitor Service - Monitors connectivity and attempts recovery."""

__version__ = "0.1.0"

from .monitor import NetworkMonitorService, NetworkState, NetworkStatus


def main():
    """Entry point for network monitor service."""
    from .config import load_config
    from sagrada.shared.logging import setup_logging

    config = load_config()
    setup_logging(config.log_level)

    service = NetworkMonitorService(config)
    service.run()


__all__ = ["NetworkMonitorService", "NetworkState", "NetworkStatus", "main"]
