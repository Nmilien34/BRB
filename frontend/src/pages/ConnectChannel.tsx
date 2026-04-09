import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import './ConnectChannel.css';

const POLL_INTERVAL = 3000;
const MAX_POLL_ATTEMPTS = 100; // 5 minutes

// Platform configs — extend as new channels launch
const platforms: Record<
  string,
  {
    name: string;
    logo: string;
    buttonLabel: string;
    subtitle: string;
    startEndpoint: string;
    statusEndpoint: string;
  }
> = {
  telegram: {
    name: 'Telegram',
    logo: '/onboardingpplatforms/Telegram_logo.svg.webp',
    buttonLabel: 'Open in Telegram',
    subtitle:
      "Open the BRB bot on Telegram to link your account. We'll notify you here when Claude needs you.",
    startEndpoint: '/api/channels/telegram/start',
    statusEndpoint: '/api/channels/telegram/status',
  },
  whatsapp: {
    name: 'WhatsApp',
    logo: '/onboardingpplatforms/WhatsApp.svg.webp',
    buttonLabel: 'Open in WhatsApp',
    subtitle:
      "Connect your WhatsApp account to receive notifications when your assistant needs you.",
    startEndpoint: '/api/channels/whatsapp/start',
    statusEndpoint: '/api/channels/whatsapp/status',
  },
  discord: {
    name: 'Discord',
    logo: '/onboardingpplatforms/discord-logo-discord-logo-transparent-discord-icon-transparent-free-free-png.webp',
    buttonLabel: 'Open in Discord',
    subtitle:
      "Add the BRB bot to your Discord server to get notified when your assistant needs you.",
    startEndpoint: '/api/channels/discord/start',
    statusEndpoint: '/api/channels/discord/status',
  },
};

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M22 2L11 13"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ConnectChannel() {
  const { platform: platformParam } = useParams<{ platform: string }>();
  const platform = platformParam && platforms[platformParam] ? platformParam : 'telegram';
  const config = platforms[platform];

  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  const authFetchRef = useRef(authFetch);
  authFetchRef.current = authFetch;

  // Start channel linking — get the deep link
  useEffect(() => {
    let cancelled = false;

    async function startLink() {
      try {
        const res = await authFetchRef.current(config.startEndpoint, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to start channel link');
        const data = await res.json();
        if (!cancelled && data.deepLink) {
          setDeepLink(data.deepLink);
        }
      } catch {
        // Fallback deep link for dev/demo
        if (!cancelled && platform === 'telegram') {
          setDeepLink('https://t.me/BRBNotifyBot?start=demo');
        }
      }
    }

    startLink();
    return () => { cancelled = true; };
  }, [config.startEndpoint, platform]);

  // Poll for connection status
  const startPolling = useCallback(() => {
    setStatus('waiting');
    setErrorMsg(null);
    attemptsRef.current = 0;

    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;

      if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus('error');
        setErrorMsg('Connection timed out. Please try again.');
        return;
      }

      try {
        const res = await authFetchRef.current(config.statusEndpoint);
        if (!res.ok) throw new Error('Status check failed');
        const data = await res.json();

        if (data.channel?.status === 'connected') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('connected');
          setTimeout(() => navigate(`/success?channel=${platform}`), 1200);
        }
      } catch {
        // Keep polling on transient errors
      }
    }, POLL_INTERVAL);
  }, [config.statusEndpoint, navigate, platform]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function handleOpen() {
    if (deepLink) {
      window.open(deepLink, '_blank');
    }
    if (status === 'idle') {
      startPolling();
    }
  }

  const statusLabel =
    status === 'waiting'
      ? 'Waiting for connection...'
      : status === 'connected'
        ? 'Connected!'
        : status === 'error'
          ? errorMsg
          : null;

  return (
    <div className="connect-channel">
      {/* Nav */}
      <nav className="connect-channel-nav">
        <Link to="/" className="connect-channel-nav-logo">
          BRB
        </Link>
        <span className="connect-channel-nav-step">Step 5 of 5</span>
      </nav>

      {/* Progress bar */}
      <div className="connect-channel-progress-track">
        <div className="connect-channel-progress-bar" />
      </div>

      {/* Content */}
      <div className="connect-channel-content">
        <div className="connect-channel-card">
          {/* Header */}
          <div className="connect-channel-header">
            <img
              src={config.logo}
              alt=""
              className="connect-channel-icon"
            />
            <h1 className="connect-channel-title">
              Connect {config.name}
            </h1>
            <p className="connect-channel-subtitle">
              {config.subtitle}
            </p>
          </div>

          {/* CTA */}
          <div className="connect-channel-cta">
            <button
              type="button"
              className={`connect-channel-button ${platform}`}
              onClick={handleOpen}
            >
              <SendIcon />
              {config.buttonLabel}
            </button>

            {statusLabel && (
              <div className="connect-channel-status">
                <div
                  className={`connect-channel-status-dot ${status === 'error' ? 'error' : status === 'connected' ? 'connected' : 'waiting'}`}
                />
                <span className="connect-channel-status-text">{statusLabel}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
