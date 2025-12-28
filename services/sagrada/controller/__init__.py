"""Heating control service."""

from .controller import HeatingController


def main():
    """Entry point for controller service."""
    import asyncio
    from sagrada.collector.config.settings import load_config
    from sagrada.shared.logging import setup_logging
    from sagrada.shared.database import DBConfig, ReadingsStorage

    config = load_config()
    setup_logging(config.log_level)

    db_config = DBConfig.from_env()
    storage = ReadingsStorage(db_config)

    controller = HeatingController(config, storage)

    try:
        asyncio.run(controller.run())
    except KeyboardInterrupt:
        pass
    finally:
        storage.close()


__all__ = ["HeatingController", "main"]
