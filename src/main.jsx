import { ClerkProvider } from '@clerk/react';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initFrontendObservability } from '@/lib/observability'

initFrontendObservability()

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    afterSignOutUrl="/"
    signInUrl="/login"
    signUpUrl="/register"
    localization={{
      signIn: {
        start: {
          title: "Sign in to La Boutique VIP",
          subtitle: "Welcome back. Sign in to manage your listings.",
        },
      },
      signUp: {
        start: {
          title: "Create your La Boutique VIP account",
          subtitle: "Join the directory to publish or manage listings.",
        },
        emailCode: {
          title: "Verify your email",
          subtitle: "Enter the 6-digit code we sent to your inbox.",
        },
      },
      userButton: {
        action__manageAccount: "Manage account",
        action__signOut: "Sign out",
      },
    }}
  >
    <App />
  </ClerkProvider>
  // </React.StrictMode>,
)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}