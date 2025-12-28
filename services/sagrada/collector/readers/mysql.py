from datetime import datetime
from typing import List, Dict, Any
import logging
import re
import pymysql

from sagrada.shared.models import Reading
from sagrada.shared.database import DBConfig
from sagrada.collector.config.settings import MySQLConfig, MySQLQuery
from .base import SensorReader

logger = logging.getLogger(__name__)

class MySQLReader(SensorReader):
    # Regex pattern to match the start of SQL queries (case insensitive)
    ALLOWED_QUERY_PATTERN = re.compile(r'^\s*SELECT\s+', re.IGNORECASE)
    
    # SQL commands that are definitely not allowed (case insensitive)
    FORBIDDEN_PATTERNS = [
        re.compile(pattern, re.IGNORECASE) for pattern in [
            r'\bINSERT\b',
            r'\bUPDATE\b',
            r'\bDELETE\b',
            r'\bDROP\b',
            r'\bTRUNCATE\b',
            r'\bALTER\b',
            r'\bCREATE\b',
            r'\bREPLACE\b',
            r'\bGRANT\b',
            r'\bREVOKE\b',
            r'\bUNION\b',
        ]
    ]

    def __init__(self, config: MySQLConfig, db_config: DBConfig):
        """
        Initialize the MySQL reader with query configs and database configuration.
        
        Args:
            config: MySQLConfig object containing list of queries
            db_config: Database configuration from the collector
        """
        self.db_config = db_config
        self.queries = []
        # Validate each query during initialization
        for query_config in config.queries:
            if self._validate_query(query_config.query):
                self.queries.append(query_config)
            else:
                logger.error(f"Rejecting invalid or unsafe query: {query_config.query[:100]}...")
        
        logger.info(f"Initialized MySQLReader with {len(self.queries)} valid queries")
    
    def _get_connection(self):
        """Get a new database connection using the collector's configuration"""
        return pymysql.connect(
            host=self.db_config.host,
            user=self.db_config.user,
            password=self.db_config.password,
            database=self.db_config.database,
            cursorclass=pymysql.cursors.DictCursor
        )
    
    def _validate_query(self, query: str) -> bool:
        """
        Validate that a query is safe to execute.
        Returns True if the query is valid and safe, False otherwise.
        """
        # Check if query starts with SELECT
        if not self.ALLOWED_QUERY_PATTERN.match(query):
            logger.error("Query must start with SELECT")
            return False
            
        # Check for forbidden SQL commands
        for pattern in self.FORBIDDEN_PATTERNS:
            if pattern.search(query):
                logger.error(f"Query contains forbidden SQL command: {pattern.pattern}")
                return False
        
        return True
    
    def get_readings(self) -> List[Reading]:
        readings = []
        now = datetime.now()
        connection = None
        
        try:
            connection = self._get_connection()
            with connection.cursor() as cursor:
                for query_config in self.queries:
                    # Execute query with parameters if provided
                    cursor.execute(query_config.query, query_config.params or [])
                    results = cursor.fetchall()
                    
                    if not results:
                        # If no results, create a null reading
                        readings.append(Reading(
                            timestamp=now,
                            source_type='mysql',
                            sensor_id=query_config.sensor_id,
                            metric=query_config.metric,
                            metric_type=query_config.metric_type,
                            value='null',
                            location=query_config.location
                        ))
                        continue

                    # Convert each result row into a Reading
                    for row in results:
                        value = row[query_config.value_column]
                        if value is not None:  # Skip null values
                            readings.append(Reading(
                                timestamp=now,
                                source_type='mysql',
                                sensor_id=query_config.sensor_id,
                                metric=query_config.metric,
                                metric_type=query_config.metric_type,
                                value=str(round(float(value), 1)) if query_config.metric_type == 'numeric' else str(value),
                                location=query_config.location
                            ))
            
            return readings
            
        except Exception as e:
            logger.error(f"Error reading from MySQL: {e}")
            return []
        finally:
            if connection:
                connection.close()
    
    def check_health(self) -> bool:
        """Check if we can connect to the database and execute a simple query"""
        connection = None
        try:
            connection = self._get_connection()
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            return True
        except Exception as e:
            logger.error(f"MySQL health check failed: {e}")
            return False
        finally:
            if connection:
                connection.close() 