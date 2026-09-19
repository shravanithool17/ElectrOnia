import React from 'react';

/**
 * Catches a render error in any route and shows something readable instead of
 * a white page.
 *
 * React unmounts the whole tree when a render throws, so without this one bad
 * field in one API response takes down the entire site — which is exactly what
 * happened on the catalogue page when a facets response arrived without its
 * `brands` array.
 *
 * Deliberately a class component: `componentDidCatch` has no hook equivalent.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In production this is where Sentry would be called.
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center text-center py-24 px-6 gap-4">
        <span className="label-mono text-slate-400">Error</span>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          This page hit a problem
        </h1>
        <p className="text-sm text-slate-500 max-w-sm">
          The rest of the site is fine. Reload to try again — if it keeps
          happening, the details are in the browser console.
        </p>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white text-[13px] font-semibold px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Reload
          </button>
          <a
            href="/"
            className="bg-white border border-slate-300 text-slate-900 text-[13px] font-semibold px-4 py-2 rounded-md hover:border-slate-900"
          >
            Go home
          </a>
        </div>

        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-xl overflow-x-auto text-left text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}
