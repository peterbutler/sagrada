import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * Chart mode: VALUES shows absolute temps, RATE shows change rate
 */
const ChartMode = {
  VALUES: 'values',
  RATE: 'rate'
};

/**
 * Default colors for chart lines
 */
const CHART_COLORS = {
  tank: { line: '#ff6600', fill: 'rgba(255, 102, 0, 0.1)' },
  floor: { line: '#00ff00', fill: 'rgba(0, 255, 0, 0.1)' },
  beginning: { line: '#0088ff', fill: 'rgba(0, 136, 255, 0.1)' },
  end: { line: '#ffaa00', fill: 'rgba(255, 170, 0, 0.1)' },
  'pre-tank': { line: '#ff00ff', fill: 'rgba(255, 0, 255, 0.1)' },
  desk: { line: '#00ff00', fill: 'rgba(0, 255, 0, 0.1)' },
  outside: { line: '#0088ff', fill: 'rgba(0, 136, 255, 0.1)' }
};

/**
 * Chart base options for dark theme
 */
const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#00ff00',
        font: {
          family: "'JetBrains Mono', monospace",
          size: 9
        },
        boxWidth: 12,
        padding: 8
      }
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      titleColor: '#00ff00',
      bodyColor: '#888888',
      borderColor: '#1a1a1a',
      borderWidth: 1,
      titleFont: {
        family: "'JetBrains Mono', monospace"
      },
      bodyFont: {
        family: "'JetBrains Mono', monospace"
      },
      padding: 8
    }
  },
  scales: {
    x: {
      grid: {
        color: '#1a1a1a'
      },
      ticks: {
        color: '#666666',
        font: {
          family: "'JetBrains Mono', monospace",
          size: 9
        },
        maxRotation: 0
      }
    },
    y: {
      grid: {
        color: '#1a1a1a'
      },
      ticks: {
        color: '#666666',
        font: {
          family: "'JetBrains Mono', monospace",
          size: 9
        }
      }
    }
  },
  elements: {
    line: {
      tension: 0.3,
      borderWidth: 1.5
    },
    point: {
      radius: 0,
      hoverRadius: 4
    }
  }
};

/**
 * Temperature chart with VALUES/RATE toggle
 * @param {Object} props
 * @param {string} props.title - Chart title
 * @param {Object} props.data - Temperature data by location { [location]: Array<{avg, min, max}> }
 * @param {Object} props.rates - Pre-computed rate data by location { [location]: Array<number|null> }
 * @param {Array<string>} props.locations - Location IDs to display
 * @param {Object} props.locationLabels - Display labels for locations
 */
export function TemperatureChart({
  title = 'LAST HOUR',
  data,
  rates,
  locations,
  locationLabels = {}
}) {
  const [mode, setMode] = useState(ChartMode.VALUES);
  const chartRef = useRef(null);

  // Generate labels (time axis)
  const labels = useMemo(() => {
    if (!data || Object.keys(data).length === 0) {
      return [];
    }

    // Get first location's data for timestamps
    const firstLocation = Object.keys(data)[0];
    const locationData = data[firstLocation] || [];

    return locationData.map((point, index) => {
      const minutesAgo = locationData.length - 1 - index;
      if (minutesAgo === 0) return '0m';
      if (minutesAgo % 10 === 0) return `-${minutesAgo}m`;
      return '';
    });
  }, [data]);

  // Build datasets using pre-computed rates from useHistory
  const datasets = useMemo(() => {
    if (!data || !locations) return [];

    return locations.map((location) => {
      const locationData = data[location] || [];
      const locationRates = rates?.[location] || [];
      const colors = CHART_COLORS[location] || { line: '#888888', fill: 'rgba(136, 136, 136, 0.1)' };
      const label = locationLabels[location] || location;

      // Use values for VALUES mode, pre-computed rates for RATE mode
      const values = mode === ChartMode.VALUES
        ? locationData.map((point) => point?.avg ?? null)
        : locationRates;

      return {
        label,
        data: values,
        borderColor: colors.line,
        backgroundColor: colors.fill,
        fill: true
      };
    });
  }, [data, rates, locations, locationLabels, mode]);

  const chartData = {
    labels,
    datasets
  };

  // Chart options with mode-specific y-axis configuration
  const options = useMemo(() => ({
    ...BASE_OPTIONS,
    scales: {
      ...BASE_OPTIONS.scales,
      y: {
        ...BASE_OPTIONS.scales.y,
        // Fixed scale for rate mode: -30 to +30 °F/hr
        ...(mode === ChartMode.RATE ? {
          min: -30,
          max: 30
        } : {}),
        title: {
          display: true,
          text: mode === ChartMode.VALUES ? '°F' : '°F/hr',
          color: '#666666',
          font: {
            family: "'JetBrains Mono', monospace",
            size: 9
          }
        }
      }
    }
  }), [mode]);

  // Throttled updates
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update('none');
    }
  }, [datasets]);

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        <div className="chart-toggle">
          <button
            className={`chart-toggle-btn ${mode === ChartMode.VALUES ? 'active' : ''}`}
            onClick={() => setMode(ChartMode.VALUES)}
          >
            Values
          </button>
          <button
            className={`chart-toggle-btn ${mode === ChartMode.RATE ? 'active' : ''}`}
            onClick={() => setMode(ChartMode.RATE)}
          >
            Rate
          </button>
        </div>
      </div>
      <div className="chart-wrapper">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
}
