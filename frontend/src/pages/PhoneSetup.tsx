import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './PhoneSetup.css';

function ChevronDown() {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
      <path d="M1 1L5 5L9 1" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PhoneSetup() {
  const [phone, setPhone] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: wire up verification API
    navigate('/dashboard');
  }

  return (
    <div className="phone-setup">
      {/* Nav */}
      <nav className="phone-setup-nav">
        <Link to="/" className="phone-setup-nav-logo">
          BRB
        </Link>
        <span className="phone-setup-nav-step">Step 3 of 3</span>
      </nav>

      {/* Progress bar */}
      <div className="phone-setup-progress-track">
        <div className="phone-setup-progress-bar" />
      </div>

      {/* Content */}
      <div className="phone-setup-content">
        <form className="phone-setup-card" onSubmit={handleSubmit}>
          {/* Header */}
          <div className="phone-setup-header">
            <h1 className="phone-setup-title">Where should BRB reach you?</h1>
            <p className="phone-setup-subtitle">
              We'll text this number when your assistant needs approval or a quick response.
            </p>
          </div>

          {/* Phone input */}
          <div className="phone-setup-input-row">
            <div className="phone-setup-country-code">
              <span className="phone-setup-flag">🇺🇸</span>
              <span className="phone-setup-code">+1</span>
              <ChevronDown />
            </div>
            <input
              type="tel"
              className="phone-setup-number"
              placeholder="(555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </div>

          {/* CTA */}
          <div className="phone-setup-cta">
            <button type="submit" className="phone-setup-button">
              Send verification code
            </button>
            <span className="phone-setup-cta-hint">
              We only use this to reach you when your assistant needs you.
            </span>
          </div>
        </form>
      </div>

      {/* Decorative elements */}
      <img
        src="/fishes/SharkGhost@2x.png"
        alt=""
        className="phone-setup-shark-ghost"
        width="100"
        height="80"
      />
      <img
        src="/fishes/WhaleGhost@2x.png"
        alt=""
        className="phone-setup-whale-ghost"
        width="140"
        height="100"
      />
    </div>
  );
}
