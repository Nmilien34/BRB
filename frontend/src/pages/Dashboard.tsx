import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import './Dashboard.css';

interface Instruction {
  id: string;
  prompt: string;
  status: 'queued' | 'dispatched' | 'completed' | 'failed';
  replyText: string | null;
  errorMessage: string | null;
  bridgeSessionLabel: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getInitials(name: string | null | undefined): string {
  if (!name || name === 'User') return 'U';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Dashboard() {
  const { user, authFetch, logout } = useAuth();
  const navigate = useNavigate();
  const authFetchRef = useRef(authFetch);
  authFetchRef.current = authFetch;

  // Connection state
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<string>('loading');
  const [channelStatus, setChannelStatus] = useState<string>('loading');
  const [copied, setCopied] = useState(false);
  const [activeProjects, setActiveProjects] = useState<Array<{ path: string; name: string; lastPingAt: string }>>([]);

  // Telegram link state
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const telegramPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Instruction history state
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loadingInstructions, setLoadingInstructions] = useState(true);

  // Profile popover
  const [showProfile, setShowProfile] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch assistant status + channel status on mount (read-only, no token rotation)
  useEffect(() => {
    let cancelled = false;

    async function fetchStatuses() {
      try {
        const [statusRes, channelRes] = await Promise.all([
          authFetchRef.current('/api/assistants/claude/status'),
          authFetchRef.current('/api/channels/telegram/status'),
        ]);

        if (cancelled) return;

        if (statusRes.ok) {
          const data = await statusRes.json();
          const status = data.status === 'connected' ? 'connected' : 'disconnected';
          setAssistantStatus(status);
          if (status === 'connected') {
            setInstallUrl('connected');
            const projects = data.connection?.metadata?.activeProjects ?? [];
            setActiveProjects(projects);
          }
        } else {
          setAssistantStatus('disconnected');
        }

        if (channelRes.ok) {
          const data = await channelRes.json();
          setChannelStatus(data.channel?.status === 'connected' ? 'connected' : 'unlinked');
        } else {
          setChannelStatus('unlinked');
        }
      } catch {
        if (!cancelled) {
          setAssistantStatus('disconnected');
          setChannelStatus('unlinked');
        }
      }
    }

    fetchStatuses();
    return () => { cancelled = true; };
  }, []);

  // Generate install command on demand (calls setup which creates a fresh token)
  const [generatingInstall, setGeneratingInstall] = useState(false);
  const handleGenerateInstall = useCallback(async () => {
    setGeneratingInstall(true);
    try {
      const res = await authFetchRef.current('/api/assistants/claude/setup');
      if (!res.ok) return;
      const data = await res.json();
      if (data.connectionToken) {
        const installBase = data.bridgeConnectUrl
          ? new URL(data.bridgeConnectUrl).origin
          : window.location.origin;
        setInstallUrl(
          `curl -sL ${installBase}/api/assistants/claude/install/${data.connectionToken} | bash`,
        );
      }
    } catch {
      // silently fail
    } finally {
      setGeneratingInstall(false);
    }
  }, []);

  // Fetch instruction history
  const fetchInstructions = useCallback(async (page: number, append: boolean) => {
    if (!append) setLoadingInstructions(true);
    try {
      const res = await authFetchRef.current(`/api/instructions?page=${page}&limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      setInstructions((prev) => append ? [...prev, ...data.instructions] : data.instructions);
      setPagination(data.pagination);
    } catch {
      // Silently fail — instructions might not exist yet
    } finally {
      setLoadingInstructions(false);
    }
  }, []);

  useEffect(() => {
    fetchInstructions(1, false);
  }, [fetchInstructions]);

  // Copy command
  const handleCopy = useCallback(async () => {
    if (!installUrl) return;
    try {
      await navigator.clipboard.writeText(installUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = installUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [installUrl]);

  // Start Telegram link flow
  const handleLinkTelegram = useCallback(async () => {
    setLinkingTelegram(true);
    try {
      const res = await authFetchRef.current('/api/channels/telegram/start', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.deepLink) {
        setTelegramDeepLink(data.deepLink);
        window.open(data.deepLink, '_blank');

        // Start polling for channel connection
        telegramPollRef.current = setInterval(async () => {
          try {
            const statusRes = await authFetchRef.current('/api/channels/telegram/status');
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            if (statusData.channel?.status === 'connected') {
              if (telegramPollRef.current) clearInterval(telegramPollRef.current);
              telegramPollRef.current = null;
              setChannelStatus('connected');
              setLinkingTelegram(false);
              setTelegramDeepLink(null);
            }
          } catch {
            // keep polling
          }
        }, 3000);
      }
    } catch {
      setLinkingTelegram(false);
    }
  }, []);

  // Cleanup telegram polling on unmount
  useEffect(() => {
    return () => {
      if (telegramPollRef.current) clearInterval(telegramPollRef.current);
    };
  }, []);

  // Compute combined status for nav
  const isLoading = assistantStatus === 'loading' || channelStatus === 'loading';
  const statusDotClass = isLoading
    ? ''
    : assistantStatus !== 'connected'
      ? 'disconnected'
      : channelStatus !== 'connected'
        ? 'warning'
        : 'connected';
  const statusLabel = isLoading
    ? ''
    : assistantStatus !== 'connected'
      ? 'Disconnected'
      : channelStatus !== 'connected'
        ? 'Telegram unlinked'
        : 'Connected';

  // Close popover on outside click
  useEffect(() => {
    if (!showProfile) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProfile]);

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="dashboard">
      {/* Nav */}
      <nav className="dashboard-nav">
        <Link to="/dashboard" className="dashboard-nav-logo">
          BRB
        </Link>
        <div className="dashboard-nav-status">
          <span className={`dashboard-status-dot ${statusDotClass}`} />
          {statusLabel}
        </div>
      </nav>

      {/* Main content */}
      <div className="dashboard-content">
        {/* Connection / Curl command */}
        <div className="dashboard-connection">
          <p className="dashboard-connection-label">Claude Code</p>
          {installUrl === 'connected' ? (
            <div className="dashboard-command">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="dashboard-command-text" style={{ color: '#4ade80' }}>
                  Connected and running.
                </span>
                {activeProjects.length > 0 && (
                  <span className="dashboard-command-text" style={{ color: '#64748b', fontSize: '12px' }}>
                    {activeProjects.map((p) => p.name).join(', ')}
                  </span>
                )}
              </div>
            </div>
          ) : installUrl ? (
            <div className="dashboard-command">
              <span className="dashboard-command-prompt">$</span>
              <span className="dashboard-command-text">{installUrl}</span>
              <button
                type="button"
                className={`dashboard-copy-btn${copied ? ' copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
          ) : (
            <div className="dashboard-command">
              <span className="dashboard-command-text">
                Not connected.
              </span>
              <button
                type="button"
                className="dashboard-copy-btn"
                onClick={handleGenerateInstall}
                disabled={generatingInstall}
              >
                {generatingInstall ? 'GENERATING…' : 'GET INSTALL COMMAND'}
              </button>
            </div>
          )}
        </div>

        {/* Channels */}
        {channelStatus !== 'loading' && (
          <div className="dashboard-channels">
            <p className="dashboard-channels-label">Channels</p>
            <div className="dashboard-channels-grid">
              {/* Telegram — active */}
              <div className={`dashboard-channel-card${channelStatus === 'connected' ? ' connected' : ''}`}>
                <div className="dashboard-channel-info">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.03-2.02 1.28-5.69 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.41-.27-2.1-.5-.85-.28-1.53-.43-1.47-.91.03-.25.38-.51 1.05-.78 4.12-1.79 6.87-2.97 8.26-3.54 3.93-1.62 4.75-1.9 5.28-1.91.12 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z" fill="#26A5E4"/></svg>
                  <span className="dashboard-channel-name">Telegram</span>
                </div>
                {channelStatus === 'connected' ? (
                  <span className="dashboard-channel-status connected">Connected</span>
                ) : telegramDeepLink ? (
                  <div className="dashboard-channel-link-actions">
                    <a
                      href={telegramDeepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dashboard-channel-link-btn"
                    >
                      Open Telegram
                    </a>
                    <span className="dashboard-channel-waiting">Waiting…</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="dashboard-channel-link-btn"
                    onClick={handleLinkTelegram}
                    disabled={linkingTelegram}
                  >
                    {linkingTelegram ? 'Connecting…' : 'Link'}
                  </button>
                )}
              </div>

              {/* Discord — coming soon */}
              <div className="dashboard-channel-card disabled">
                <div className="dashboard-channel-info">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20.32 4.37a19.8 19.8 0 00-4.89-1.52.07.07 0 00-.08.04c-.21.38-.45.87-.61 1.26a18.27 18.27 0 00-5.49 0 12.64 12.64 0 00-.62-1.26.07.07 0 00-.08-.04 19.74 19.74 0 00-4.89 1.52.07.07 0 00-.03.03C1.07 8.4.32 12.3.7 16.15a.08.08 0 00.03.05 19.9 19.9 0 005.99 3.03.08.08 0 00.08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 00-.04-.1 13.1 13.1 0 01-1.87-.9.08.08 0 01-.01-.12c.13-.09.25-.19.37-.29a.07.07 0 01.08-.01c3.93 1.8 8.18 1.8 12.07 0a.07.07 0 01.08.01c.12.1.25.2.37.29a.08.08 0 01-.01.12c-.6.35-1.22.65-1.87.9a.08.08 0 00-.04.1c.36.7.77 1.37 1.22 2a.08.08 0 00.08.03 19.83 19.83 0 006-3.03.08.08 0 00.03-.05c.44-4.53-.73-8.46-3.1-11.95a.06.06 0 00-.03-.03zM8.02 13.83c-1.03 0-1.89-.95-1.89-2.12s.83-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.83-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z" fill="#5865F2"/></svg>
                  <span className="dashboard-channel-name">Discord</span>
                </div>
                <span className="dashboard-channel-badge">Coming soon</span>
              </div>

              {/* WhatsApp — coming soon */}
              <div className="dashboard-channel-card disabled">
                <div className="dashboard-channel-info">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.52-.08-.15-.68-1.64-.93-2.25-.25-.59-.5-.51-.68-.52h-.58c-.2 0-.52.07-.8.38-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.22 5.1 4.51.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.76-.72 2.01-1.41.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.34zM12.05 21.5h-.03a9.44 9.44 0 01-4.81-1.32l-.35-.2-3.56.93.95-3.47-.23-.36A9.42 9.42 0 012.5 12.04C2.5 6.78 6.78 2.5 12.05 2.5c2.57 0 4.98 1 6.79 2.82a9.54 9.54 0 012.81 6.8c0 5.26-4.28 9.54-9.54 9.54l-.06-.16zm8.1-17.66A11.43 11.43 0 0012.05.5C5.67.5.5 5.67.5 12.05c0 2.04.53 4.03 1.54 5.78L.5 23.5l5.83-1.53a11.38 11.38 0 005.72 1.54h.01c6.38 0 11.55-5.17 11.55-11.55a11.48 11.48 0 00-3.39-8.12z" fill="#25D366"/></svg>
                  <span className="dashboard-channel-name">WhatsApp</span>
                </div>
                <span className="dashboard-channel-badge">Coming soon</span>
              </div>
            </div>
          </div>
        )}

        {/* Commands reference */}
        <div className="dashboard-commands">
          <p className="dashboard-commands-label">Commands</p>
          <div className="dashboard-commands-grid">
            <div className="dashboard-commands-group">
              <p className="dashboard-commands-group-title">Send instructions</p>
              <div className="dashboard-commands-list">
                <div className="dashboard-command-row">
                  <code>Claude &lt;message&gt;</code>
                  <span>Send an instruction to Claude</span>
                </div>
                <div className="dashboard-command-row">
                  <code>Codex &lt;message&gt;</code>
                  <span>Send an instruction to Codex</span>
                </div>
                <div className="dashboard-command-row">
                  <code>Cursor &lt;message&gt;</code>
                  <span>Send an instruction to Cursor</span>
                </div>
              </div>
            </div>
            <div className="dashboard-commands-group">
              <p className="dashboard-commands-group-title">Target a project</p>
              <div className="dashboard-commands-list">
                <div className="dashboard-command-row">
                  <code>Claude @project &lt;message&gt;</code>
                  <span>Send to a specific project</span>
                </div>
                <div className="dashboard-command-row">
                  <code>&lt;message&gt;</code>
                  <span>Sends to last used agent</span>
                </div>
              </div>
            </div>
            <div className="dashboard-commands-group">
              <p className="dashboard-commands-group-title">Approvals</p>
              <div className="dashboard-commands-list">
                <div className="dashboard-command-row">
                  <code>list</code>
                  <span>View pending approvals</span>
                </div>
                <div className="dashboard-command-row">
                  <code>yes / no</code>
                  <span>Approve or deny current request</span>
                </div>
                <div className="dashboard-command-row">
                  <code>why</code>
                  <span>Get details on current approval</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instruction history */}
        <div className="dashboard-history">
          <p className="dashboard-history-label">Message history</p>

          {loadingInstructions ? (
            <div className="dashboard-loading">Loading...</div>
          ) : instructions.length === 0 ? (
            <div className="dashboard-empty">
              No messages yet.<br />
              Send your first instruction through Telegram -- start with an agent name like "Claude".
            </div>
          ) : (
            <>
              <div className="dashboard-history-list">
                {instructions.map((inst) => (
                  <div key={inst.id} className="dashboard-instruction">
                    <div className="dashboard-instruction-header">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="dashboard-instruction-prompt">{inst.prompt}</span>
                        {inst.bridgeSessionLabel && (
                          <span className="dashboard-instruction-session">{inst.bridgeSessionLabel}</span>
                        )}
                      </div>
                      <div className="dashboard-instruction-meta">
                        <span className={`dashboard-instruction-badge ${inst.status}`}>
                          {inst.status}
                        </span>
                        <span className="dashboard-instruction-time">
                          {timeAgo(inst.createdAt)}
                        </span>
                      </div>
                    </div>
                    {inst.replyText && (
                      <div className="dashboard-instruction-reply">{inst.replyText}</div>
                    )}
                    {inst.errorMessage && (
                      <div className="dashboard-instruction-error">{inst.errorMessage}</div>
                    )}
                  </div>
                ))}
              </div>
              {pagination && pagination.page < pagination.totalPages && (
                <button
                  type="button"
                  className="dashboard-load-more"
                  onClick={() => fetchInstructions(pagination.page + 1, true)}
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Profile bubble */}
      <div className="dashboard-profile-bubble" ref={popoverRef}>
        {showProfile && (
          <div className="dashboard-profile-popover">
            <div className="dashboard-profile-name">{user?.name || 'User'}</div>
            <div className="dashboard-profile-email">{user?.email}</div>
            <button type="button" className="dashboard-logout-btn" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
        <button
          type="button"
          className="dashboard-profile-avatar"
          onClick={() => setShowProfile((s) => !s)}
          aria-label="Profile"
        >
          {getInitials(user?.name)}
        </button>
      </div>
    </div>
  );
}
