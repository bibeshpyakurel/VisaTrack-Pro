import React from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: 'var(--gray-900)', marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: 'var(--gray-500)', marginBottom: '1.5rem', maxWidth: 420, margin: '0 auto 1.5rem' }}>
            {this.state.error?.message || 'An unexpected error occurred on this page.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
            <Link to="/" className="btn btn-secondary">Go home</Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
