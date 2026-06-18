// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Loader2, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";

function resolveVerificationStatusFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const rawStatus = params.get("status");
  if (!rawStatus) return null;
  const normalized = rawStatus.trim().toLowerCase();
  if (["approved", "success", "completed"].includes(normalized)) return "approved";
  if (["declined", "rejected", "failed"].includes(normalized)) return "rejected";
  if (["in review", "under_review", "pending_review"].includes(normalized)) return "under_review";
  return "pending";
}

function resolveVerificationIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("verificationId") || params.get("verification_id") || null;
}

export default function DiditVerification({ onVerificationComplete, onVerificationStatusChange }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState(() => resolveVerificationStatusFromQuery() || "pending"); // pending, in_progress, approved, rejected
  const [verificationIdHint] = useState(() => resolveVerificationIdFromQuery());

  useEffect(() => {
    const statusFromQuery = resolveVerificationStatusFromQuery();
    if (!statusFromQuery) return;
    setVerificationStatus(statusFromQuery);
    onVerificationStatusChange?.(statusFromQuery);
  }, [onVerificationStatusChange]);

  // Poll verification status from either active session or callback query.
  useEffect(() => {
    const verificationId = session?.verificationId || verificationIdHint;
    if (!verificationId) return;

    const checkStatus = async () => {
      try {
        const verifications = await base44.entities.Verification.filter({
          id: verificationId,
        });
        
        if (verifications.length > 0) {
          const status = verifications[0].status;
          setVerificationStatus(status);
          
          if (onVerificationStatusChange) {
            onVerificationStatusChange(status);
          }
          
          if (status === "approved" && onVerificationComplete) {
            onVerificationComplete(verifications[0]);
          }
        }
      } catch (err) {
        console.error("Error checking verification status:", err);
      }
    };

    // Check immediately and then every 5 seconds.
    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [session?.verificationId, verificationIdHint, onVerificationComplete, onVerificationStatusChange]);

  const createSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/v1/verifications/didit/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          returnUrl: window.location.origin + window.location.pathname,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create verification session");
      }

      const data = await response.json();
      if (!data?.launchUrl) {
        throw new Error("Verification session was created without a launch URL.");
      }

      setSession(data);
      setVerificationStatus("in_progress");

      const popup = window.open(data.launchUrl, "didit-verification", "width=600,height=800");
      if (!popup) {
        // Fall back to top-level navigation when popup blockers are enabled.
        window.location.href = data.launchUrl;
      }
    } catch (err) {
      setError(err.message || "Failed to start verification");
    } finally {
      setLoading(false);
    }
  };

  const getStatusDisplay = () => {
    switch (verificationStatus) {
      case "approved":
        return {
          icon: <CheckCircle className="w-12 h-12 text-green-500" />,
          title: "Verification Approved",
          description: "Your identity has been verified. Your profile is now active!",
          badge: <Badge className="bg-green-500/20 text-green-400 border-green-500">Verified</Badge>,
        };
      case "rejected":
        return {
          icon: <AlertCircle className="w-12 h-12 text-red-500" />,
          title: "Verification Failed",
          description: "Your verification was not approved. Please contact support.",
          badge: <Badge className="bg-red-500/20 text-red-400 border-red-500">Failed</Badge>,
        };
      case "under_review":
        return {
          icon: <Loader2 className="w-12 h-12 text-sky-500 animate-spin" />,
          title: "Verification Under Review",
          description: "Your identity check is waiting for final review. We will update this page automatically when the decision arrives.",
          badge: <Badge className="bg-sky-500/20 text-sky-400 border-sky-500">In Review</Badge>,
        };
      case "in_progress":
        return {
          icon: <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />,
          title: "Verification In Progress",
          description: "Please complete the verification process in the opened window. This page will update automatically.",
          badge: <Badge className="bg-amber-500/20 text-amber-400 border-amber-500">In Progress</Badge>,
        };
      default:
        return {
          icon: <Shield className="w-12 h-12 text-rose-500" />,
          title: "Identity Verification Required",
          description: "Complete ID verification to automatically approve your profile and get verified badge.",
          badge: null,
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-rose-400" />
            Identity Verification
          </CardTitle>
          {statusDisplay.badge}
        </div>
        <CardDescription className="text-zinc-400">
          {statusDisplay.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center py-8">
          <div className="flex justify-center mb-4">
            {statusDisplay.icon}
          </div>
          <h3 className="text-xl font-semibold text-zinc-100 mb-2">
            {statusDisplay.title}
          </h3>
          <p className="text-zinc-400 max-w-md mx-auto">
            {statusDisplay.description}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {verificationStatus === "pending" && (
          <div className="space-y-4">
            <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-zinc-200">What to expect:</h4>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li>• Quick identity verification process</li>
                <li>• Automatic profile approval upon success</li>
                <li>• Verified badge on your profile</li>
                <li>• Secure and encrypted verification</li>
              </ul>
            </div>
            <Button
              onClick={createSession}
              disabled={loading}
              className="w-full bg-gradient-to-r from-rose-500 to-amber-500"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting Verification...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Start Identity Verification
                </>
              )}
            </Button>
          </div>
        )}

        {verificationStatus === "in_progress" && session && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-amber-400 text-sm">
                Verification window opened. If you closed it, click below to reopen.
              </p>
            </div>
            <Button
              onClick={() => window.open(session.launchUrl, "didit-verification", "width=600,height=800")}
              variant="outline"
              className="w-full border-zinc-700 text-zinc-300"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Reopen Verification Window
            </Button>
          </div>
        )}

        {verificationStatus === "approved" && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Your profile is now verified and active!</span>
            </div>
          </div>
        )}

        {verificationStatus === "under_review" && (
          <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-4">
            <p className="text-sky-300 text-sm">
              Verification is waiting on manual review from the provider. You do not need to restart the process unless support asks you to.
            </p>
          </div>
        )}

        {verificationStatus === "rejected" && (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-red-400 text-sm">
                Verification was not successful. You can try again or contact support for assistance.
              </p>
            </div>
            <Button
              onClick={createSession}
              variant="outline"
              className="w-full border-zinc-700 text-zinc-300"
            >
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
