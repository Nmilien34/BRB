import { Link } from 'react-router-dom';
import './Landing.css';

function LinkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M12 16l-2 2a3.5 3.5 0 01-5-5l4-4a3.5 3.5 0 015 0" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 12l2-2a3.5 3.5 0 00-5-5l-4 4a3.5 3.5 0 000 5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="8" y="3" width="12" height="22" rx="3" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
      <line x1="12" y1="21" x2="16" y2="21" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="10" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
      <path d="M10 14.5l2.5 2.5 5.5-5.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function WaveSvg() {
  return (
    <svg
      className="landing-wave"
      height="30"
      viewBox="0 0 1440 30"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M0 15 Q60 8 120 15 Q180 22 240 15 Q300 8 360 15 Q420 22 480 15 Q540 8 600 15 Q660 22 720 15 Q780 8 840 15 Q900 22 960 15 Q1020 8 1080 15 Q1140 22 1200 15 Q1260 8 1320 15 Q1380 22 1440 15"
        stroke="#bfdbfe"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <Link to="/" className="landing-nav-logo">
          BRB
        </Link>
        <Link to="/signin" className="landing-nav-signin">
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <h1 className="landing-headline">
          Your assistant keeps working. Even when you're away.
        </h1>
        <p className="landing-subtext">
          Approve, respond, and stay connected to your AI coding assistant from your phone. No
          laptop required.
        </p>
      </section>

      {/* Ocean Scene */}
      <section className="landing-ocean">
        <div className="landing-ocean-inner">
          <img
            src="/landingpage/SVG@2xsmallfish.png"
            alt=""
            className="landing-shark"
            width="140"
            height="120"
          />

          <div className="landing-cta-wrap">
            <Link to="/signin" className="landing-cta">
              Get Started
            </Link>
            <div className="landing-bubbles">
              <div className="landing-bubble" />
              <div className="landing-bubble" />
              <div className="landing-bubble" />
            </div>
          </div>

          <img
            src="/landingpage/SVG@2x.png"
            alt=""
            className="landing-whale"
            width="200"
            height="160"
          />

          <div className="landing-ocean-surface" />
          <WaveSvg />
        </div>
      </section>

      {/* How It Works */}
      <section className="landing-steps">
        <p className="landing-steps-label">How it works</p>
        <div className="landing-steps-grid">
          <div className="landing-step">
            <LinkIcon />
            <p className="landing-step-title">Connect your assistant</p>
            <p className="landing-step-desc">
              Link your AI coding tool — Claude Code, Cursor, or others — in one step.
            </p>
          </div>
          <div className="landing-step">
            <PhoneIcon />
            <p className="landing-step-title">Add your phone</p>
            <p className="landing-step-desc">
              Verify your number. Get approval requests and alerts via SMS.
            </p>
          </div>
          <div className="landing-step">
            <CheckIcon />
            <p className="landing-step-title">Walk away</p>
            <p className="landing-step-desc">
              Approve, deny, or respond from anywhere. Your assistant never stops.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span className="landing-footer-copy">&copy; 2025 Boltzmann Lab<span className="landing-footer-copy-extra">. All rights reserved.</span></span>
        <div className="landing-footer-links">
          <a href="#" className="landing-footer-link">
            Privacy
          </a>
          <a href="#" className="landing-footer-link">
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
