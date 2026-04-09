import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import './InstallAssistant.css';

const POLL_INTERVAL = 3000;
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max

export default function InstallAssistant() {
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  const authFetchRef = useRef(authFetch);
  authFetchRef.current = authFetch;

  // Fetch setup payload to get the install command
  useEffect(() => {
    let cancelled = false;

    async function fetchSetup() {
      try {
        const res = await authFetchRef.current('/api/assistants/claude/setup');
        if (!res.ok) throw new Error('Failed to fetch setup info');
        const data = await res.json();
        if (!cancelled && data.connectionToken) {
          setInstallUrl(`curl -sL brb.dev/install/${data.connectionToken} | bash`);
        }
      } catch {
        // Fallback — show placeholder until backend is wired
        if (!cancelled) {
          setInstallUrl('curl -sL brb.dev/install/abc123 | bash');
        }
      }
    }

    fetchSetup();
    return () => { cancelled = true; };
  }, []);

  // Copy command to clipboard
  const handleCopy = useCallback(async () => {
    if (!installUrl) return;
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = installUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [installUrl]);

  // Poll for connection status
  const startPolling = useCallback(() => {
    setChecking(true);
    setError(null);
    attemptsRef.current = 0;

    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;

      if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setChecking(false);
        setError('Connection timed out. Please make sure you ran the command and try again.');
        return;
      }

      try {
        const res = await authFetchRef.current('/api/assistants/claude/status');
        if (!res.ok) throw new Error('Status check failed');
        const data = await res.json();

        if (data.status === 'connected') {
          if (pollRef.current) clearInterval(pollRef.current);
          setChecking(false);
          navigate('/channel');
        }
      } catch {
        // Keep polling on transient errors
      }
    }, POLL_INTERVAL);
  }, [navigate]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function handleRunCommand() {
    if (checking) return;
    startPolling();
  }

  return (
    <div className="install-assistant">
      {/* Nav */}
      <nav className="install-assistant-nav">
        <Link to="/" className="install-assistant-nav-logo">
          BRB
        </Link>
        <span className="install-assistant-nav-step">Step 3 of 5</span>
      </nav>

      {/* Progress bar */}
      <div className="install-assistant-progress-track">
        <div className="install-assistant-progress-bar" />
      </div>

      {/* Content */}
      <div className="install-assistant-content">
        <div className="install-assistant-card">
          {/* Header */}
          <div className="install-assistant-header">
            <h1 className="install-assistant-title">Connect Claude Code</h1>
            <p className="install-assistant-subtitle">
              Run this command in your project directory to connect Claude to BRB.
            </p>
          </div>

          {/* Command block */}
          <div className="install-assistant-command">
            <span className="install-assistant-prompt">$</span>
            <span className="install-assistant-cmd">
              {installUrl ?? 'Loading...'}
            </span>
            <button
              type="button"
              className={`install-assistant-copy${copied ? ' copied' : ''}`}
              onClick={handleCopy}
              disabled={!installUrl}
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </div>

          {/* Helper text */}
          <div className="install-assistant-helper">
            <p className="install-assistant-helper-text">
              This sets up a background service that keeps Claude connected to BRB — even when
              you step away.
            </p>
          </div>

          {/* CTA */}
          <div className="install-assistant-cta">
            <button
              type="button"
              className={`install-assistant-button${checking ? ' checking' : ''}`}
              onClick={handleRunCommand}
              disabled={checking}
            >
              {checking ? 'Waiting for connection…' : "I've run the command"}
            </button>
            {error && <span className="install-assistant-status error">{error}</span>}
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <img
        src="/fishes/SharkGhost@2x.png"
        alt=""
        className="install-assistant-shark-ghost"
        width="100"
        height="80"
      />
      <img
        src="/fishes/WhaleGhost@2x.png"
        alt=""
        className="install-assistant-whale-ghost"
        width="140"
        height="100"
      />
    </div>
  );
}
