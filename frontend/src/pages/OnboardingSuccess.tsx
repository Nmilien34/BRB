import { Link, useSearchParams } from 'react-router-dom';
import './OnboardingSuccess.css';

// Assistant configs
const assistants: Record<string, { name: string; label: string }> = {
  'claude-code': { name: 'Claude Code', label: 'Assistant' },
  codex: { name: 'Codex', label: 'Assistant' },
  cursor: { name: 'Cursor', label: 'Assistant' },
  antigravity: { name: 'Antigravity', label: 'Assistant' },
};

// Channel configs
const channels: Record<string, { name: string; label: string }> = {
  telegram: { name: 'Telegram', label: 'Notification channel' },
  whatsapp: { name: 'WhatsApp', label: 'Notification channel' },
  discord: { name: 'Discord', label: 'Notification channel' },
};

function CheckIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M20 6L9 17L4 12"
        stroke="#10B981"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AssistantIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M12 2L2 7L12 12L22 7L12 2Z"
        stroke="#F97316"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 17L12 22L22 17"
        stroke="#F97316"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12L12 17L22 12"
        stroke="#F97316"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M22 2L11 13"
        stroke="#3B82F6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        stroke="#3B82F6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function OnboardingSuccess() {
  const [searchParams] = useSearchParams();
  const assistantId = searchParams.get('assistant') || 'claude-code';
  const channelId = searchParams.get('channel') || 'telegram';

  const assistant = assistants[assistantId] || assistants['claude-code'];
  const channel = channels[channelId] || channels['telegram'];

  return (
    <div className="onboarding-success">
      {/* Nav */}
      <nav className="onboarding-success-nav">
        <Link to="/" className="onboarding-success-nav-logo">
          BRB
        </Link>
        <span className="onboarding-success-nav-step">Complete</span>
      </nav>

      {/* Progress bar */}
      <div className="onboarding-success-progress-track">
        <div className="onboarding-success-progress-bar" />
      </div>

      {/* Content */}
      <div className="onboarding-success-content">
        <div className="onboarding-success-card">
          {/* Success icon */}
          <div className="onboarding-success-icon">
            <CheckIcon />
          </div>

          {/* Header */}
          <div className="onboarding-success-header">
            <h1 className="onboarding-success-title">You're all set</h1>
            <p className="onboarding-success-subtitle">
              BRB will reach you on {channel.name} whenever {assistant.name} needs approval or
              has something to share.
            </p>
          </div>

          {/* Connection summary */}
          <div className="onboarding-success-summary">
            {/* Assistant row */}
            <div className="onboarding-success-row">
              <div className="onboarding-success-row-icon assistant">
                <AssistantIcon />
              </div>
              <div className="onboarding-success-row-info">
                <span className="onboarding-success-row-name">{assistant.name}</span>
                <span className="onboarding-success-row-label">{assistant.label}</span>
              </div>
              <div className="onboarding-success-row-status">
                <div className="onboarding-success-row-dot" />
                <span className="onboarding-success-row-status-text">Connected</span>
              </div>
            </div>

            {/* Channel row */}
            <div className="onboarding-success-row">
              <div className="onboarding-success-row-icon channel">
                <ChannelIcon />
              </div>
              <div className="onboarding-success-row-info">
                <span className="onboarding-success-row-name">{channel.name}</span>
                <span className="onboarding-success-row-label">{channel.label}</span>
              </div>
              <div className="onboarding-success-row-status">
                <div className="onboarding-success-row-dot" />
                <span className="onboarding-success-row-status-text">Connected</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="onboarding-success-cta">
            <Link to="/dashboard" className="onboarding-success-button">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
