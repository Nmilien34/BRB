import { Link, useNavigate } from 'react-router-dom';
import './Paywall.css';

const benefits = [
  'Stay reachable while your assistant works',
  'Approve and reply from your phone',
  'Your own dedicated BRB line',
];

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="9" fill="#EFF6FF" />
      <path
        d="M6 9.5L8 11.5L12 7"
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Paywall() {
  const navigate = useNavigate();

  function handleUnlock() {
    navigate('/dashboard');
  }

  function handleSkip() {
    navigate('/dashboard');
  }

  return (
    <div className="paywall">
      {/* Nav */}
      <nav className="paywall-nav">
        <Link to="/" className="paywall-nav-logo">
          BRB
        </Link>
      </nav>

      {/* Content */}
      <div className="paywall-content">
        <div className="paywall-card">
          {/* Header */}
          <div className="paywall-header">
            <h1 className="paywall-title">Unlock your BRB line</h1>
            <p className="paywall-subtitle">
              Your assistant keeps working while you're away. BRB keeps you connected by text.
            </p>
          </div>

          {/* Benefits */}
          <div className="paywall-benefits">
            {benefits.map((text) => (
              <div key={text} className="paywall-benefit">
                <span className="paywall-benefit-icon">
                  <CheckIcon />
                </span>
                <span className="paywall-benefit-text">{text}</span>
              </div>
            ))}
          </div>

          {/* Pricing + CTA */}
          <div className="paywall-cta">
            <div className="paywall-pricing">
              <span className="paywall-price">$5</span>
              <span className="paywall-period">/month</span>
            </div>
            <button type="button" className="paywall-button" onClick={handleUnlock}>
              Unlock BRB — $5/month
            </button>
            <span className="paywall-hint">Cancel anytime</span>
          </div>

          <button type="button" className="paywall-skip" onClick={handleSkip}>
            Continue with limited free trial
          </button>
        </div>
      </div>

      {/* Decorative elements */}
      <img
        src="/fishes/SharkGhost@2x.png"
        alt=""
        className="paywall-shark-ghost"
        width="100"
        height="80"
      />
      <img
        src="/fishes/WhaleGhost@2x.png"
        alt=""
        className="paywall-whale-ghost"
        width="140"
        height="100"
      />
    </div>
  );
}
