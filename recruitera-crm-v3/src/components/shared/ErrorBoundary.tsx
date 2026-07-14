import { Component, type ReactNode } from 'react';

type State = { err: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error('[ErrorBoundary]', err); }

  render() {
    if (this.state.err) {
      return (
        <div className="p-6">
          <div className="max-w-xl mx-auto bg-bad-bg border border-bad/30 rounded-2xl p-6">
            <div className="text-[11px] font-bold uppercase tracking-wider text-bad">Something broke</div>
            <div className="mt-1 text-[15px] font-bold text-text">Please refresh the page.</div>
            <pre className="mt-3 text-[11.5px] font-mono text-text-2 bg-surface rounded-lg p-3 overflow-auto max-h-64">
{this.state.err.message}
            </pre>
            <button
              onClick={() => this.setState({ err: null })}
              className="mt-4 h-9 px-4 rounded-lg bg-cg-900 text-white text-[12.5px] font-bold hover:bg-cg-800"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
