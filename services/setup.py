"""Setup script for the sagrada package."""

from setuptools import find_packages, setup

setup(
    name="sagrada",
    version="0.1.0",
    description="Sagrada climate monitoring and control system",
    author="Peter Butler",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "pymysql",
        "pyyaml",
        "python-dotenv",
        "paho-mqtt>=2.0.0",
        "python-kasa",
        "bleak",
        "aiohttp",
        "rich",
    ],
    extras_require={
        "dev": [
            "pytest",
            "pytest-asyncio",
            "black",
            "isort",
            "mypy",
        ],
    },
    entry_points={
        "console_scripts": [
            "sagrada-collector=sagrada.collector:main",
            "sagrada-controller=sagrada.controller:main",
            "sagrada-display=sagrada.display:main",
            "sagrada-mqtt-logger=sagrada.mqtt_logger:main",
            "sagrada-ble-bridge=sagrada.ble_bridge:main",
            "sagrada-network-monitor=sagrada.network_monitor:main",
        ],
    },
)
