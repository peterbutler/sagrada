"""Heating control service."""

from .controller import HeatingController


def main():
    """Entry point for controller service."""
    import asyncio
    from sagrada.collector.config.settings import load_config
    from sagrada.shared.logging import setup_logging
    from sagrada.shared.database import DBConfig

    config = load_config()
    setup_logging(config.log_level)

    db_config = DBConfig.from_env()

    controller = HeatingController(db_config, config.kasa)

    try:
        asyncio.run(controller.control_loop())
    except KeyboardInterrupt:
        pass


__all__ = ["HeatingController", "main"]
