import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { captureFrontendException } from '@/lib/observability';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    captureFrontendException(error, {
      componentStack: info?.componentStack || null,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
          <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center space-y-4 shadow-2xl">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-zinc-400">
                We logged the error if monitoring is enabled. Reload the page to try again.
              </p>
            </div>
            <Button onClick={this.handleReload} className="w-full bg-rose-600 hover:bg-rose-500 text-white">
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
