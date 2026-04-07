import { Link } from 'react-router-dom';
import './SignIn.css';

function ConnectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7.5 2.5L4.5 5.5L3 4" stroke="#3B82F6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 4.5C11 4.5 11.5 5.5 11.5 7C11.5 9.485 9.485 11.5 7 11.5C4.515 11.5 2.5 9.485 2.5 7C2.5 4.515 4.515 2.5 7 2.5C7.8 2.5 8.55 2.72 9.2 3.1" stroke="#3B82F6" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="4" y="1.5" width="6" height="11" rx="1.2" stroke="#3B82F6" strokeWidth="1.2" />
      <line x1="6" y1="10.5" x2="8" y2="10.5" stroke="#3B82F6" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 4L7 8L12 4" stroke="#3B82F6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="#3B82F6" strokeWidth="1.2" />
    </svg>
  );
}

function WaveSvg() {
  return (
    <svg
      className="welcome-wave"
      height="40"
      viewBox="0 0 1440 40"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M0 20 Q60 10 120 20 Q180 30 240 20 Q300 10 360 20 Q420 30 480 20 Q540 10 600 20 Q660 30 720 20 Q780 10 840 20 Q900 30 960 20 Q1020 10 1080 20 Q1140 30 1200 20 Q1260 10 1320 20 Q1380 30 1440 20"
        stroke="#bfdbfe"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

export default function SignIn() {
  return (
    <div className="welcome">
      {/* Nav */}
      <nav className="welcome-nav">
        <Link to="/" className="welcome-nav-logo">
          BRB
        </Link>
        <span className="welcome-nav-step">Step 1 of 3</span>
      </nav>

      {/* Progress bar */}
      <div className="welcome-progress-track">
        <div className="welcome-progress-bar" />
      </div>

      {/* Content */}
      <div className="welcome-content">
        <div className="welcome-card">
          {/* Header */}
          <div className="welcome-header">
            <h1 className="welcome-title">Set up in under a minute.</h1>
            <p className="welcome-subtitle">
              Three quick steps and your assistant stays connected — even when you walk away.
            </p>
          </div>

          {/* Steps */}
          <div className="welcome-steps">
            <div className="welcome-step">
              <div className="welcome-step-icon">
                <ConnectIcon />
              </div>
              <span className="welcome-step-text">Connect your assistant</span>
            </div>
            <div className="welcome-step">
              <div className="welcome-step-icon">
                <PhoneIcon />
              </div>
              <span className="welcome-step-text">Add your mobile</span>
            </div>
            <div className="welcome-step">
              <div className="welcome-step-icon">
                <MessageIcon />
              </div>
              <span className="welcome-step-text">Send a test message</span>
            </div>
          </div>

          {/* CTA */}
          <div className="welcome-cta">
            <Link to="/assistants" className="welcome-button">
              Begin Setup
            </Link>
            <span className="welcome-cta-hint">Takes less than 60 seconds</span>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <img
        src="/fishes/SharkGhost@2x.png"
        alt=""
        className="welcome-shark-ghost"
        width="110"
        height="90"
      />
      <img
        src="/fishes/WhaleGhost@2x.png"
        alt=""
        className="welcome-whale-ghost"
        width="160"
        height="120"
      />
      <WaveSvg />
      <div className="welcome-ocean-gradient" />
    </div>
  );
}
