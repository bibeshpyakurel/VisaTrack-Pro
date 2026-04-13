import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './App.css';

// Lazy-load all pages — keeps initial bundle small
const HomePage      = lazy(() => import('./pages/HomePage.jsx'));
const CompaniesPage = lazy(() => import('./pages/CompaniesPage.jsx'));
const CompanyPage   = lazy(() => import('./pages/CompanyPage.jsx'));
const StatePage     = lazy(() => import('./pages/StatePage.jsx'));
const ApiDocsPage   = lazy(() => import('./pages/ApiDocsPage.jsx'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
      <div className="spinner" />
    </div>
  );
}

function Navbar() {
  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="logo">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="#2563EB"/>
            <text x="16" y="23" fontSize="18" textAnchor="middle" fill="white" fontFamily="Arial" fontWeight="bold">V</text>
          </svg>
          <span>VisaTrack <strong>Pro</strong></span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/" end>Map</NavLink>
          <NavLink to="/companies">Companies</NavLink>
          <NavLink to="/api-docs">API</NavLink>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const [lastImport, setLastImport] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => setLastImport(data.last_import))
      .catch(() => {});
  }, []);

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <p>
          H-1B data sourced from{' '}
          <a href="https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" target="_blank" rel="noopener noreferrer">
            USCIS H-1B Employer Data Hub
          </a>
          . AI enrichment by OpenAI.
        </p>
        {lastImport && (
          <p className="footer-freshness">
            Last data import: <strong>{new Date(lastImport.at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</strong>
            {' · '}{lastImport.records.toLocaleString()} records · {lastImport.filename}
          </p>
        )}
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="main-content">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"           element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
              <Route path="/companies"  element={<ErrorBoundary><CompaniesPage /></ErrorBoundary>} />
              <Route path="/company/:name" element={<ErrorBoundary><CompanyPage /></ErrorBoundary>} />
              <Route path="/state/:code"   element={<ErrorBoundary><StatePage /></ErrorBoundary>} />
              <Route path="/api-docs"      element={<ErrorBoundary><ApiDocsPage /></ErrorBoundary>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
