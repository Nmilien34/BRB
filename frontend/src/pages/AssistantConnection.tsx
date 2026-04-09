import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import './AssistantConnection.css';

const assistants = [
  { id: 'claude-code', name: 'Claude Code', logo: '/CodingAssistants/Claude_AI_symbol.svg' },
  { id: 'codex', name: 'Codex', logo: '/CodingAssistants/codex-color.svg' },
  { id: 'cursor', name: 'Cursor', logo: '/CodingAssistants/cursor-ai-code-icon (2).svg' },
  { id: 'antigravity', name: 'Antigravity', logo: '/CodingAssistants/antigravity-icon__full-color.png' },
];

export default function AssistantConnection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  async function handleContinue() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch('/api/assistants/claude/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantType: selected }),
      });
      if (!res.ok) throw new Error('Failed to save selection');
      navigate('/install');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="select-assistant">
      {/* Nav */}
      <nav className="select-assistant-nav">
        <Link to="/" className="select-assistant-nav-logo">
          BRB
        </Link>
        <span className="select-assistant-nav-step">Step 2 of 5</span>
      </nav>

      {/* Progress bar */}
      <div className="select-assistant-progress-track">
        <div className="select-assistant-progress-bar" />
      </div>

      {/* Content */}
      <div className="select-assistant-content">
        <div className="select-assistant-card">
          {/* Header */}
          <div className="select-assistant-header">
            <h1 className="select-assistant-title">Which assistant are you using?</h1>
            <p className="select-assistant-subtitle">
              Select your AI coding assistant. You can change this later.
            </p>
          </div>

          {/* Assistant Grid */}
          <div className="select-assistant-grid">
            {assistants.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`select-assistant-option${selected === a.id ? ' selected' : ''}`}
                onClick={() => setSelected(a.id)}
              >
                <img src={a.logo} alt="" width="44" height="44" />
                <span className="select-assistant-option-name">{a.name}</span>
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="select-assistant-cta">
            <button
              type="button"
              className="select-assistant-button"
              disabled={!selected || submitting}
              onClick={handleContinue}
            >
              {submitting ? 'Saving…' : 'Continue'}
            </button>
            {error && <span className="select-assistant-error">{error}</span>}
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <img
        src="/fishes/SharkGhost@2x.png"
        alt=""
        className="select-assistant-shark-ghost"
        width="100"
        height="80"
      />
      <img
        src="/fishes/WhaleGhost@2x.png"
        alt=""
        className="select-assistant-whale-ghost"
        width="140"
        height="100"
      />
    </div>
  );
}
