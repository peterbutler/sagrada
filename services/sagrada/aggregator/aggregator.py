"""Readings aggregation service.

Aggregates raw sensor_readings into minute_readings for efficient historical queries.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any

import pymysql
from pymysql.cursors import DictCursor

from sagrada.shared.database import DBConfig

logger = logging.getLogger(__name__)


def get_aggregation_query() -> str:
    """Get the SQL query for aggregating sensor readings by minute."""
    return """
    WITH last_readings AS (
        SELECT
            DATE_FORMAT(timestamp, '%%Y-%%m-%%d %%H:%%i:00') as timestamp,
            source_type,
            location,
            sensor_id,
            metric,
            metric_type,
            value,
            ROW_NUMBER() OVER (PARTITION BY
                DATE_FORMAT(timestamp, '%%Y-%%m-%%d %%H:%%i:00'),
                source_type,
                location,
                sensor_id,
                metric
                ORDER BY timestamp DESC) as rn
        FROM sensor_readings
        WHERE timestamp BETWEEN %s AND %s
    )
    SELECT
        l.timestamp,
        l.source_type,
        l.location,
        l.sensor_id,
        l.metric,

        -- Numeric aggregations
        CASE
            WHEN l.metric_type = 'numeric'
            THEN AVG(CAST(l.value AS DECIMAL(10,2)))
        END as avg_value,

        CASE
            WHEN l.metric_type = 'numeric'
            THEN MIN(CAST(l.value AS DECIMAL(10,2)))
        END as min_value,

        CASE
            WHEN l.metric_type = 'numeric'
            THEN MAX(CAST(l.value AS DECIMAL(10,2)))
        END as max_value,

        -- For state values, take the last reading
        MAX(CASE
            WHEN l.metric_type = 'state' AND l.rn = 1
            THEN l.value
        END) as end_state,

        COUNT(*) as sample_count

    FROM last_readings l
    GROUP BY
        l.timestamp,
        l.source_type,
        l.location,
        l.sensor_id,
        l.metric
    """


class ReadingsAggregator:
    """Aggregates sensor readings into minute-level summaries."""

    def __init__(self, db_config: DBConfig):
        """Initialize aggregator with database configuration.

        Args:
            db_config: Database connection configuration.
        """
        self.db_config = db_config

    def _get_connection(self) -> pymysql.Connection:
        """Create a new database connection."""
        return pymysql.connect(
            host=self.db_config.host,
            user=self.db_config.user,
            password=self.db_config.password,
            database=self.db_config.database,
            cursorclass=DictCursor,
        )

    def _store_aggregated_data(
        self, cursor: pymysql.cursors.Cursor, results: List[Dict[str, Any]]
    ) -> int:
        """Store aggregated data in the minute_readings table.

        Args:
            cursor: Database cursor.
            results: List of aggregated reading dictionaries.

        Returns:
            Number of rows inserted/updated.
        """
        if not results:
            return 0

        insert_sql = """
        INSERT INTO minute_readings (
            timestamp,
            source_type,
            location,
            sensor_id,
            metric,
            avg_value,
            min_value,
            max_value,
            end_state,
            sample_count
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        """

        values = [
            (
                row["timestamp"],
                row["source_type"],
                row["location"],
                row["sensor_id"],
                row["metric"],
                row["avg_value"],
                row["min_value"],
                row["max_value"],
                row["end_state"],
                row["sample_count"],
            )
            for row in results
        ]

        cursor.executemany(insert_sql, values)
        return len(values)

    def aggregate(self, start_time: datetime, end_time: datetime) -> int:
        """Aggregate sensor readings for a time range.

        Deletes any existing minute_readings in the time range, then inserts
        fresh aggregations. This avoids duplicates without requiring a
        composite unique key on the table.

        Args:
            start_time: Start of time range to aggregate.
            end_time: End of time range to aggregate.

        Returns:
            Number of minute_readings records inserted.
        """
        connection = self._get_connection()

        try:
            with connection.cursor() as cursor:
                # Delete existing records for this time range
                delete_sql = """
                DELETE FROM minute_readings
                WHERE timestamp >= %s AND timestamp < %s
                """
                cursor.execute(delete_sql, (start_time, end_time))
                deleted = cursor.rowcount

                # Get fresh aggregated data
                query = get_aggregation_query()
                cursor.execute(query, (start_time, end_time))
                results = cursor.fetchall()

                # Insert new aggregated records
                rows_inserted = self._store_aggregated_data(cursor, results)
                connection.commit()

                if deleted > 0:
                    logger.debug(f"Replaced {deleted} existing records")

                return rows_inserted

        except Exception as e:
            logger.error(f"Error during aggregation: {e}")
            connection.rollback()
            raise
        finally:
            connection.close()
