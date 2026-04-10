import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import LoginModal from '../components/LoginModal';
import './Landing.css';

function LinkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M12 16l-2 2a3.5 3.5 0 01-5-5l4-4a3.5 3.5 0 015 0" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 12l2-2a3.5 3.5 0 00-5-5l-4 4a3.5 3.5 0 000 5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M4 7a3 3 0 013-3h14a3 3 0 013 3v10a3 3 0 01-3 3h-6l-5 4v-4H7a3 3 0 01-3-3V7z" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
  const [showLogin, setShowLogin] = useState(false);
  const navigate = useNavigate();
  const { user, token, loading } = useAuth();

  // Redirect already-logged-in users to dashboard
  useEffect(() => {
    if (!loading && token && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, token, user, navigate]);

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <Link to="/" className="landing-nav-logo">
          BRB
        </Link>
        <button type="button" className="landing-nav-signin" onClick={() => setShowLogin(true)}>
          Sign in
        </button>
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
            <button type="button" className="landing-cta" onClick={() => setShowLogin(true)}>
              Get Started
            </button>
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
            <ChannelIcon />
            <p className="landing-step-title">Connect your channel</p>
            <p className="landing-step-desc">
              Choose Telegram, WhatsApp, or Discord to get approval requests and alerts.
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

      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={() => navigate('/dashboard')}
      />
    </div>
  );
}
