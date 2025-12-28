import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Footer with system info and Explorer link
 */
export function Footer() {
  const buildDate = new Date().toISOString().split('T')[0].replace(/-/g, '.');

  return (
    <footer className="footer">
      <span>GREENHOUSE MONITORING SYSTEM</span>
      <span>•</span>
      <span>BUILD {buildDate}</span>
      <span>•</span>
      <Link to="/explore">EXPLORER MODE</Link>
    </footer>
  );
}
