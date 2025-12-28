import React from 'react';
import { Link } from 'react-router-dom';

export function Explorer() {
  return (
    <div className="dashboard">
      <header className="header panel">
        <div className="header-left">
          <h1 className="header-title">GREENHOUSE MONITOR v2.0</h1>
        </div>
        <div className="header-right">
          <Link to="/" style={{ color: 'var(--color-green)', textDecoration: 'none' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="explorer-placeholder">
        <h2>Explorer Mode</h2>
        <p>Historical data exploration coming soon.</p>
        <p style={{ marginTop: '16px' }}>
          <Link to="/" style={{ color: 'var(--color-green)' }}>
            Return to Dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
