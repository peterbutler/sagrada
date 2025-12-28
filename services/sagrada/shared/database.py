"""Database configuration and storage utilities."""

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import pymysql
from pymysql.cursors import DictCursor

from .models import Reading

logger = logging.getLogger(__name__)


@dataclass
class DBConfig:
    """Database connection configuration."""
    host: str
    user: str
    password: str
    database: str

    @classmethod
    def from_env(cls) -> "DBConfig":
        """Create config from environment variables."""
        return cls(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", ""),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_DATABASE", "climate"),
        )


class ReadingsStorage:
    """Manages storage and retrieval of sensor readings in MySQL.

    Consolidated from shed-monitor and mqtt-logger storage implementations.
    """

    def __init__(self, db_config: DBConfig):
        """Initialize storage with database configuration.

        Args:
            db_config: Database connection configuration.
        """
        self.db_config = db_config
        self._connection: Optional[pymysql.Connection] = None

    def _get_connection(self) -> pymysql.Connection:
        """Get or create database connection."""
        if self._connection is None or not self._connection.open:
            self._connection = pymysql.connect(
                host=self.db_config.host,
                user=self.db_config.user,
                password=self.db_config.password,
                database=self.db_config.database,
                cursorclass=DictCursor,
            )
        return self._connection

    def store_reading(self, reading: Reading) -> bool:
        """Store a single reading.

        Args:
            reading: The reading to store.

        Returns:
            True if successful, False otherwise.
        """
        return self.store_readings([reading])

    def store_readings(self, readings: List[Reading]) -> bool:
        """Store multiple readings in a single transaction.

        Args:
            readings: List of readings to store.

        Returns:
            True if successful, False otherwise.
        """
        if not readings:
            return True

        conn = self._get_connection()
        try:
            with conn.cursor() as cursor:
                # Insert into sensor_readings
                insert_sql = """
                    INSERT INTO sensor_readings
                    (timestamp, source_type, sensor_id, location, metric, metric_type, value)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """
                values = [
                    (
                        r.timestamp,
                        r.source_type,
                        r.sensor_id,
                        r.location,
                        r.metric,
                        r.metric_type,
                        r.value,
                    )
                    for r in readings
                ]
                cursor.executemany(insert_sql, values)

                # Update current_readings for each unique sensor/metric
                upsert_sql = """
                    INSERT INTO current_readings
                    (sensor_id, location, metric, metric_type, value, timestamp, source_type, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    ON DUPLICATE KEY UPDATE
                        value = VALUES(value),
                        timestamp = VALUES(timestamp),
                        source_type = VALUES(source_type),
                        updated_at = NOW()
                """
                for r in readings:
                    cursor.execute(
                        upsert_sql,
                        (
                            r.sensor_id,
                            r.location,
                            r.metric,
                            r.metric_type,
                            r.value,
                            r.timestamp,
                            r.source_type,
                        ),
                    )

            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error storing readings: {e}")
            conn.rollback()
            return False

    def get_current_readings(
        self,
        source_type: Optional[str] = None,
        location: Optional[str] = None,
        metric: Optional[str] = None,
        max_age_seconds: Optional[int] = None,
    ) -> List[Reading]:
        """Get current readings with optional filters.

        Args:
            source_type: Filter by source type (e.g., 'kasa', 'ble').
            location: Filter by location.
            metric: Filter by metric name.
            max_age_seconds: Only return readings newer than this many seconds.

        Returns:
            List of matching readings.
        """
        conn = self._get_connection()

        conditions = []
        params = []

        if source_type:
            conditions.append("source_type = %s")
            params.append(source_type)
        if location:
            conditions.append("location = %s")
            params.append(location)
        if metric:
            conditions.append("metric = %s")
            params.append(metric)
        if max_age_seconds:
            cutoff = datetime.now() - timedelta(seconds=max_age_seconds)
            conditions.append("timestamp >= %s")
            params.append(cutoff)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        query = f"""
            SELECT timestamp, source_type, sensor_id, location, metric, metric_type, value
            FROM current_readings
            WHERE {where_clause}
            ORDER BY location, metric
        """

        try:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                return [
                    Reading(
                        timestamp=row["timestamp"],
                        source_type=row["source_type"],
                        sensor_id=row["sensor_id"],
                        location=row["location"],
                        metric=row["metric"],
                        metric_type=row["metric_type"],
                        value=row["value"],
                    )
                    for row in rows
                ]
        except Exception as e:
            logger.error(f"Error fetching current readings: {e}")
            return []

    def get_historical_readings(
        self,
        start_time: datetime,
        end_time: Optional[datetime] = None,
        location: Optional[str] = None,
        metric: Optional[str] = None,
        limit: int = 1000,
    ) -> List[Reading]:
        """Get historical readings within a time range.

        Args:
            start_time: Start of time range.
            end_time: End of time range (defaults to now).
            location: Filter by location.
            metric: Filter by metric name.
            limit: Maximum number of readings to return.

        Returns:
            List of matching readings.
        """
        conn = self._get_connection()
        end_time = end_time or datetime.now()

        conditions = ["timestamp BETWEEN %s AND %s"]
        params: List = [start_time, end_time]

        if location:
            conditions.append("location = %s")
            params.append(location)
        if metric:
            conditions.append("metric = %s")
            params.append(metric)

        where_clause = " AND ".join(conditions)

        query = f"""
            SELECT timestamp, source_type, sensor_id, location, metric, metric_type, value
            FROM sensor_readings
            WHERE {where_clause}
            ORDER BY timestamp DESC
            LIMIT %s
        """
        params.append(limit)

        try:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                rows = cursor.fetchall()
                return [
                    Reading(
                        timestamp=row["timestamp"],
                        source_type=row["source_type"],
                        sensor_id=row["sensor_id"],
                        location=row["location"],
                        metric=row["metric"],
                        metric_type=row["metric_type"],
                        value=row["value"],
                    )
                    for row in rows
                ]
        except Exception as e:
            logger.error(f"Error fetching historical readings: {e}")
            return []

    def get_latest_reading(
        self,
        location: str,
        metric: str,
    ) -> Optional[Reading]:
        """Get the most recent reading for a location/metric.

        Args:
            location: Location to query.
            metric: Metric name to query.

        Returns:
            The latest reading, or None if not found.
        """
        readings = self.get_current_readings(location=location, metric=metric)
        return readings[0] if readings else None

    def close(self):
        """Close the database connection."""
        if self._connection:
            self._connection.close()
            self._connection = None
