import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './ChannelSelect.css';

const channels = [
  {
    id: 'telegram',
    name: 'Telegram',
    logo: '/onboardingpplatforms/Telegram_logo.svg.webp',
    available: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    logo: '/onboardingpplatforms/WhatsApp.svg.webp',
    available: false,
  },
  {
    id: 'discord',
    name: 'Discord',
    logo: '/onboardingpplatforms/discord-logo-discord-logo-transparent-discord-icon-transparent-free-free-png.webp',
    available: false,
  },
];

export default function ChannelSelect() {
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useNavigate();

  function handleContinue() {
    if (!selected) return;
    navigate(`/connect/${selected}`);
  }

  return (
    <div className="channel-select">
      {/* Nav */}
      <nav className="channel-select-nav">
        <Link to="/" className="channel-select-nav-logo">
          BRB
        </Link>
        <span className="channel-select-nav-step">Step 4 of 5</span>
      </nav>

      {/* Progress bar */}
      <div className="channel-select-progress-track">
        <div className="channel-select-progress-bar" />
      </div>

      {/* Content */}
      <div className="channel-select-content">
        <div className="channel-select-card">
          {/* Header */}
          <div className="channel-select-header">
            <h1 className="channel-select-title">Where should BRB reach you?</h1>
            <p className="channel-select-subtitle">
              Choose how you'd like to get notified when your assistant needs you.
            </p>
          </div>

          {/* Channel Grid */}
          <div className="channel-select-grid">
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`channel-select-option${selected === ch.id ? ' selected' : ''}${!ch.available ? ' coming-soon' : ''}`}
                onClick={() => ch.available && setSelected(ch.id)}
                disabled={!ch.available}
              >
                <img src={ch.logo} alt="" width="44" height="44" />
                <span className="channel-select-option-name">{ch.name}</span>
                {!ch.available && <span className="channel-select-coming-soon">Coming soon</span>}
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="channel-select-cta">
            <button
              type="button"
              className="channel-select-button"
              disabled={!selected}
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <img
        src="/fishes/SharkGhost@2x.png"
        alt=""
        className="channel-select-shark-ghost"
        width="100"
        height="80"
      />
      <img
        src="/fishes/WhaleGhost@2x.png"
        alt=""
        className="channel-select-whale-ghost"
        width="140"
        height="100"
      />
    </div>
  );
}
