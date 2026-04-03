import React from 'react';
import { AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-paper z-50 p-8 text-center overflow-hidden">
          <div className="grain-overlay" />
          <div className="ruled-bg opacity-30" />
          
          <div className="relative z-10 flex flex-col items-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-red-50/80 backdrop-blur-sm border border-red-100 flex items-center justify-center mb-6 shadow-sm">
              <AlertTriangle size={32} className="text-red-500" strokeWidth={1.5} />
            </div>
            
            <h2 className="text-2xl font-display font-semibold text-ink-dark leading-tight mb-3">
              Application Error
            </h2>
            
            <p className="text-sm font-mono text-ink-light/80 leading-relaxed mb-8 break-words text-center">
              {this.state.error?.message ?? 'An unexpected system fault occurred.'}
            </p>
            
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-6 py-3 bg-ink-dark text-paper-25 font-mono text-xs uppercase tracking-[0.1em] font-medium rounded-xl hover:bg-ink transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm"
            >
              Recover Session
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
