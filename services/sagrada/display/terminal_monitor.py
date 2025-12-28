"""
Terminal Monitor for Climate System Display
Full-screen terminal interface using Rich library.
Designed for direct output to /dev/tty1.
"""

import logging
from datetime import datetime
from typing import Optional

from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.live import Live
from rich.align import Align

from .data_fetcher import DataFetcher, SystemStatus
from sagrada.collector.config.settings import Config

logger = logging.getLogger(__name__)

class TerminalMonitor:
    """Terminal-based display monitor using Rich"""
    
    def __init__(self, config: Config):
        self.config = config
        self.data_fetcher = DataFetcher(config.db_config)
        
        # Create Rich console for /dev/tty1 output
        try:
            # For systemd service, output directly to /dev/tty1
            self.console = Console(file=open('/dev/tty1', 'w'), force_terminal=True)
            logger.info("Console initialized for /dev/tty1")
        except (OSError, PermissionError) as e:
            # Fallback to stdout for testing/development
            logger.warning(f"Could not open /dev/tty1, falling back to stdout: {e}")
            self.console = Console(force_terminal=True)
        
        self.live_display = None
        
    def update_display(self):
        """Update the display with current system status"""
        try:
            # Fetch current system status
            status = self.data_fetcher.get_system_status()
            
            # Create the full display layout
            layout = self._create_layout(status)
            
            # Clear screen and display
            self.console.clear()
            self.console.print(layout)
            
        except Exception as e:
            logger.error(f"Display update failed: {e}")
            # Show error message on display
            self._show_error_display(str(e))
    
    def _create_layout(self, status: SystemStatus) -> Layout:
        """Create the main display layout"""
        # Create main layout
        layout = Layout()
        
        # Split into header and body
        layout.split_column(
            Layout(name="header", size=3),
            Layout(name="body")
        )
        
        # Split body into left and right columns
        layout["body"].split_row(
            Layout(name="left"),
            Layout(name="right")
        )
        
        # Split left column into temperature and control sections
        layout["left"].split_column(
            Layout(name="temperatures", size=12),
            Layout(name="control")
        )
        
        # Split right column into system status and alerts
        layout["right"].split_column(
            Layout(name="system", size=12),
            Layout(name="alerts")
        )
        
        # Populate each section
        layout["header"].update(self._create_header(status))
        layout["temperatures"].update(self._create_temperature_panel(status))
        layout["control"].update(self._create_control_panel(status))
        layout["system"].update(self._create_system_panel(status))
        layout["alerts"].update(self._create_alerts_panel(status))
        
        return layout
    
    def _create_header(self, status: SystemStatus) -> Panel:
        """Create header with title and timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Connection status indicator
        db_indicator = "🟢 ONLINE" if status.database_connected else "🔴 OFFLINE"
        
        header_text = Text()
        header_text.append("SHED CLIMATE MONITOR", style="bold cyan")
        header_text.append(f" - {timestamp}", style="white")
        header_text.append(f" - DB: {db_indicator}", style="green" if status.database_connected else "red")
        
        return Panel(
            Align.center(header_text),
            style="cyan"
        )
    
    def _create_temperature_panel(self, status: SystemStatus) -> Panel:
        """Create temperature readings panel"""
        table = Table(show_header=True, header_style="bold cyan", box=None)
        table.add_column("Location", style="white", width=14)
        table.add_column("Temperature", style="white", width=12)
        table.add_column("Rate", style="white", width=8)
        
        # Priority order for display (format: {system}/{location})
        priority_locations = [
            'heating/tank', 'ambient/desk', 'heating/floor', 'outside/main',
            'ambient/workbench', 'heating/heater-input', 'heating/heater-output',
            'heating/pre-tank', 'ambient/door'
        ]

        for location in priority_locations:
            sensor = status.sensors.get(location)
            if sensor:
                # Color coding based on status and values
                if not sensor.is_online:
                    temp_style = "red"
                    status_style = "red"
                elif sensor.value is not None:
                    if location == 'heating/tank' and sensor.value < 120:
                        temp_style = "yellow"
                    elif sensor.value < 40:  # Freeze warning
                        temp_style = "red"
                    elif sensor.value > 80:  # Hot
                        temp_style = "yellow" 
                    else:
                        temp_style = "green"
                    status_style = "green"
                else:
                    temp_style = "red"
                    status_style = "red"
                
                # Format location name with status indicator
                location_display = location.replace('-', ' ').title()
                status_indicator = "●" if sensor.is_online else "○"
                location_with_status = f"{status_indicator} {location_display}"
                
                # Format rate of change
                if sensor.rate_of_change is not None:
                    rate_text = f"{sensor.rate_of_change:+.1f}/h"
                    # Color code the rate based on direction
                    if sensor.rate_of_change > 2:
                        rate_style = "red"  # Rapidly warming
                    elif sensor.rate_of_change < -2:
                        rate_style = "cyan"  # Rapidly cooling
                    elif sensor.rate_of_change > 0:
                        rate_style = "yellow"  # Slowly warming
                    else:
                        rate_style = "green"  # Stable or slowly cooling
                else:
                    rate_text = "---"
                    rate_style = temp_style
                
                table.add_row(
                    location_with_status,
                    f"{sensor.value:.1f}°F" if sensor.value is not None else "---",
                    rate_text,
                    style=temp_style
                )
        
        return Panel(table, title="TEMPERATURES", style="cyan")
    
    def _create_system_panel(self, status: SystemStatus) -> Panel:
        """Create system status panel"""
        table = Table(show_header=True, header_style="bold cyan", box=None)
        table.add_column("Component", style="white", width=10)
        table.add_column("Status", style="white", width=15)
        table.add_column("Last Change", style="white", width=10)
        
        for component_name in ['heater', 'pump', 'fan']:
            component = status.components.get(component_name)
            if component:
                status_text = "ON" if component.is_on else "OFF"
                status_style = "green" if component.is_on else "red"
                
                # Format last change time
                if component.last_toggle:
                    age = datetime.now() - component.last_toggle
                    if age.total_seconds() < 60:
                        age_text = f"{int(age.total_seconds())}s"
                    elif age.total_seconds() < 3600:
                        age_text = f"{int(age.total_seconds() / 60)}m"
                    else:
                        age_text = f"{int(age.total_seconds() / 3600)}h"
                else:
                    age_text = "Unknown"
                
                table.add_row(
                    component_name.title(),
                    status_text,
                    age_text,
                    style=status_style
                )
        
        # Add target temperature
        if status.target_temp:
            table.add_row("Target", f"{status.target_temp:.1f}°F", "", style="cyan")
        
        return Panel(table, title="SYSTEM STATUS", style="cyan")
    
    def _create_control_panel(self, status: SystemStatus) -> Panel:
        """Create control logic panel"""
        content = []
        
        # Control mode
        mode_color = "green" if "Error" not in status.control_mode else "red"
        content.append(Text(f"Mode: {status.control_mode}", style=f"bold {mode_color}"))
        content.append("")
        
        # Control reasoning
        content.append(Text("Current Logic:", style="bold white"))
        
        # Split long reasoning text into lines
        reason_lines = status.control_reason.split('\n')
        for line in reason_lines:
            if len(line) > 50:  # Wrap long lines
                words = line.split()
                current_line = ""
                for word in words:
                    if len(current_line) + len(word) + 1 <= 50:
                        current_line += (" " if current_line else "") + word
                    else:
                        content.append(Text(f"  {current_line}", style="white"))
                        current_line = word
                if current_line:
                    content.append(Text(f"  {current_line}", style="white"))
            else:
                content.append(Text(f"  {line}", style="white"))
        
        # Create a text object with all content
        panel_content = Text()
        for i, item in enumerate(content):
            if isinstance(item, str):
                panel_content.append(item + "\n")
            else:
                panel_content.append_text(item)
                if i < len(content) - 1:
                    panel_content.append("\n")
        
        return Panel(panel_content, title="CONTROL LOGIC", style="cyan")
    
    def _create_alerts_panel(self, status: SystemStatus) -> Panel:
        """Create alerts and warnings panel"""
        if not status.alerts:
            content = Text("✓ All systems normal", style="green")
        else:
            content = Text()
            for i, alert in enumerate(status.alerts):
                if i > 0:
                    content.append("\n")
                
                # Color code alerts by severity
                if "🚨" in alert or "ERROR" in alert.upper():
                    style = "red"
                elif "⚠" in alert or "WARNING" in alert.upper():
                    style = "yellow"
                elif "🥶" in alert or "FREEZE" in alert.upper():
                    style = "red"
                else:
                    style = "white"
                
                content.append(alert, style=f"bold {style}")
        
        return Panel(content, title="ALERTS", style="cyan")
    
    def _show_error_display(self, error_msg: str):
        """Show error display when system fails"""
        try:
            self.console.clear()
            
            error_panel = Panel(
                Align.center(Text(f"DISPLAY ERROR\n\n{error_msg}", style="bold red")),
                title="System Error",
                style="red"
            )
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            header = Panel(
                Align.center(Text(f"SHED CLIMATE MONITOR - {timestamp} - ERROR", style="bold red")),
                style="red"
            )
            
            layout = Layout()
            layout.split_column(
                Layout(header, size=3),
                Layout(error_panel)
            )
            
            self.console.print(layout)
            
        except Exception as e:
            # Ultimate fallback
            logger.error(f"Failed to show error display: {e}")
            try:
                self.console.print(f"CRITICAL ERROR: {error_msg}")
            except:
                pass
    
    def cleanup(self):
        """Cleanup resources"""
        try:
            if hasattr(self.console, 'file') and hasattr(self.console.file, 'close'):
                if self.console.file.name == '/dev/tty1':
                    self.console.file.close()
        except Exception as e:
            logger.error(f"Cleanup error: {e}")