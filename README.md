* {
  box-sizing: border-box;
}

:root {
  color-scheme: dark;
  font-family: Inter, 'Segoe UI', sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  line-height: 1.5;
  font-weight: 400;
}

html, body, #root {
  margin: 0;
  min-height: 100%;
  min-height: 100vh;
  background: #0b1220;
}

body {
  min-height: 100vh;
}

button, input, textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-shell {
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #0b1220, #111827 38%, #0f172a 100%);
}

.sidebar {
  width: 320px;
  background: rgba(15, 23, 42, 0.9);
  border-right: 1px solid rgba(148, 163, 184, 0.15);
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #38bdf8, #8b5cf6);
  color: white;
  font-weight: 700;
}

.eyebrow {
  margin: 0;
  color: #94a3b8;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1, h2, p {
  margin: 0;
}

.secondary-button,
.primary-button {
  border: none;
  border-radius: 12px;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.secondary-button {
  padding: 10px 14px;
  background: rgba(148, 163, 184, 0.12);
  color: #f8fafc;
}

.primary-button {
  padding: 12px 18px;
  background: linear-gradient(135deg, #38bdf8, #8b5cf6);
  color: white;
  font-weight: 600;
}

.secondary-button:hover,
.primary-button:hover {
  transform: translateY(-1px);
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(15, 118, 110, 0.08);
  border: 1px solid rgba(45, 212, 191, 0.2);
}

.settings-panel label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #dbeafe;
  font-size: 0.9rem;
}

.settings-panel input,
.settings-panel textarea,
.composer textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.7);
  color: #f8fafc;
  padding: 10px 12px;
}

.settings-panel textarea,
.composer textarea {
  resize: vertical;
}

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  padding: 22px 28px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.35);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-row {
  display: flex;
}

.message-row.user {
  justify-content: flex-end;
}

.message-bubble {
  max-width: min(75%, 760px);
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.14);
  white-space: pre-wrap;
  word-break: break-word;
}

.message-row.user .message-bubble {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(139, 92, 246, 0.3));
  border-color: rgba(96, 165, 250, 0.45);
}

.message-bubble.typing {
  opacity: 0.8;
  font-style: italic;
}

.composer {
  display: flex;
  align-items: end;
  gap: 12px;
  padding: 18px 28px 24px;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.32);
}

.composer textarea {
  min-height: 52px;
  max-height: 200px;
  border-radius: 14px;
}

@media (max-width: 820px) {
  .app-shell {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  }

  .message-bubble {
    max-width: 88%;
  }
}
