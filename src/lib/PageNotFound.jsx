import { useLocation } from 'react-router-dom';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-8xl font-bold text-zinc-800 font-serif">404</h1>
        <h2 className="text-2xl font-semibold text-zinc-200">Page not found</h2>
        <p className="text-zinc-500 leading-relaxed">
          The page <span className="font-medium text-zinc-400">"{pageName}"</span> doesn't exist.
        </p>
        <div className="pt-4">
          <button
            onClick={() => { window.location.href = '/'; }}
            className="inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-rose-500 to-amber-500 rounded-full hover:opacity-95"
          >
            Return home
          </button>
        </div>
      </div>
    </div>
  );
}