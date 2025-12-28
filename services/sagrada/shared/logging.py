"""Logging configuration utilities."""

import logging
from typing import Dict, List, Optional


def setup_logging(
    level: str = "INFO",
    format_string: Optional[str] = None,
    quiet_loggers: Optional[List[str]] = None,
) -> None:
    """Configure logging for Sagrada services.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        format_string: Custom format string for log messages.
        quiet_loggers: List of logger names to set to WARNING level.
    """
    if format_string is None:
        format_string = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # Convert string to logging level
    log_level = getattr(logging, level.upper(), logging.INFO)

    logging.basicConfig(
        level=log_level,
        format=format_string,
    )

    # Quiet down verbose third-party loggers
    default_quiet = ["bleak", "asyncio"]
    quiet_loggers = (quiet_loggers or []) + default_quiet

    for logger_name in quiet_loggers:
        logging.getLogger(logger_name).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name.

    Args:
        name: Logger name (typically __name__).

    Returns:
        Configured logger instance.
    """
    return logging.getLogger(name)
