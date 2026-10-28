import { useEffect, useMemo, useState } from 'react';

const STORAGE_CONFIG_KEY = 'chatgpt-clone-config';
const STORAGE_CHAT_KEY = 'chatgpt-clone-chats';

const defaultConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  systemPrompt:
    'You are a helpful, concise assistant. Be direct, professional, and clear.'
};

const createNewChat = (title = 'New chat') => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}`,
  title,
  messages: []
});

const safeJsonParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

function App() {
  const [config, setConfig] = useState(() =>
    safeJsonParse(localStorage.getItem(STORAGE_CONFIG_KEY), defaultConfig)
  );

  const [chats, setChats] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem(STORAGE_CHAT_KEY), null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }

    return [
      {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'welcome-chat',
        title: 'Welcome',
        messages: [
          {
            role: 'assistant',
            content:
              'Welcome! Configure your OpenAI-compatible API in settings, then start chatting.'
          }
        ]
      }
    ];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem(STORAGE_CHAT_KEY), null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored[0].id;
    }
    return null;
  });

  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (chats.length === 0) {
      const freshChat = createNewChat('New chat');
      setChats([freshChat]);
      setActiveChatId(freshChat.id);
      return;
    }

    localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(chats));
  }, [chats]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? chats[0],
    [activeChatId, chats]
  );

  useEffect(() => {
    if (!activeChat && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChat, chats]);

  const startNewChat = () => {
    const nextChat = createNewChat('New chat');
    setChats((previous) => [nextChat, ...previous]);
    setActiveChatId(nextChat.id);
    setDraft('');
    setError('');
  };

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setError('');
  };

  const handleSendMessage = async () => {
    if (!draft.trim() || isLoading) {
      return;
    }

    const userMessage = draft.trim();
    if (!config.apiKey.trim()) {
      setError('Add an API key in settings before sending requests.');
      setShowSettings(true);
      return;
    }

    if (!config.baseUrl.trim()) {
      setError('Enter a valid base URL for your OpenAI-compatible API.');
      setShowSettings(true);
      return;
    }

    const conversationBeforeSend = activeChat?.messages || [];
    const userPayload = { role: 'user', content: userMessage };
    const assistantPlaceholder = { role: 'assistant', content: 'Thinking…' };

    setChats((previous) =>
      previous.map((chat) => {
        if (chat.id !== activeChatId) {
          return chat;
        }

        const nextTitle =
          chat.title === 'New chat' ? userMessage.slice(0, 22) || 'New chat' : chat.title;

        return {
          ...chat,
          title: nextTitle,
          messages: [...chat.messages, userPayload, assistantPlaceholder]
        };
      })
    );

    setDraft('');
    setIsLoading(true);
    setError('');

    try {
      const systemMessages = config.systemPrompt.trim()
        ? [{ role: 'system', content: config.systemPrompt.trim() }]
        : [];

      const response = await fetch(
        `${config.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey.trim()}`
          },
          body: JSON.stringify({
            model: config.model,
            messages: [...systemMessages, ...conversationBeforeSend, userPayload],
            temperature: 0.7
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed (${response.status}): ${errorText.slice(0, 220) || 'Unknown error'}`
        );
      }

      const data = await response.json();
      const assistantReply =
        data?.choices?.[0]?.message?.content ||
        'The API responded without a usable message.';

      setChats((previous) =>
        previous.map((chat) => {
          if (chat.id !== activeChatId) {
            return chat;
          }

          const messages = [...chat.messages];
          const lastIndex = messages.length - 1;
          if (messages[lastIndex]?.role === 'assistant') {
            messages[lastIndex] = { role: 'assistant', content: assistantReply };
          } else {
            messages.push({ role: 'assistant', content: assistantReply });
          }

          return { ...chat, messages };
        })
      );
    } catch (requestError) {
      setChats((previous) =>
        previous.map((chat) => {
          if (chat.id !== activeChatId) {
            return chat;
          }

          const messages = [...chat.messages];
          const lastIndex = messages.length - 1;
          const errorContent = `Error: ${requestError.message}`;

          if (messages[lastIndex]?.role === 'assistant') {
            messages[lastIndex] = { role: 'assistant', content: errorContent };
          } else {
            messages.push({ role: 'assistant', content: errorContent });
          }

          return { ...chat, messages };
        })
      );
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="icon-button" onClick={() => setSidebarOpen((value) => !value)}>
            ☰
          </button>
          <button className="new-chat-button" onClick={startNewChat}>
            <span>＋</span> New chat
          </button>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Recent</div>
          {chats.map((chat) => (
            <button
              key={chat.id}
              className={`chat-row ${chat.id === activeChatId ? 'active' : ''}`}
              onClick={() => handleSelectChat(chat.id)}
            >
              <span className="chat-row-title">{chat.title}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-only" onClick={() => setSidebarOpen((value) => !value)}>
              ☰
            </button>
            <div className="brand-mark">OpenAI Compatible</div>
          </div>

          <div className="topbar-actions">
            <button className="ghost-button" onClick={startNewChat}>
              New chat
            </button>
            <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Open settings">
              ⚙️
            </button>
          </div>
        </header>

        <div className="conversation-wrap">
          {activeChat?.messages.length ? (
            <div className="messages">
              {activeChat.messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`message-row ${message.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <div className="avatar">{message.role === 'user' ? 'U' : 'AI'}</div>
                  <div className="message-bubble">
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>How can I help?</h2>
              <p>Start a conversation with your configured API model.</p>
            </div>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="composer-wrap">
          <div className="composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Message the assistant…"
            />
            <button className="send-button" onClick={handleSendMessage} disabled={isLoading || !draft.trim()}>
              {isLoading ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </main>

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <h3>API settings</h3>
              <button className="icon-button" onClick={() => setShowSettings(false)}>
                ✕
              </button>
            </div>

            <label>
              API base URL
              <input
                value={config.baseUrl}
                onChange={(event) => setConfig((previous) => ({ ...previous, baseUrl: event.target.value }))}
                placeholder="https://api.openai.com/v1"
              />
            </label>

            <label>
              API key
              <input
                type="password"
                value={config.apiKey}
                onChange={(event) => setConfig((previous) => ({ ...previous, apiKey: event.target.value }))}
                placeholder="sk-..."
              />
            </label>

            <label>
              Model
              <input
                value={config.model}
                onChange={(event) => setConfig((previous) => ({ ...previous, model: event.target.value }))}
                placeholder="gpt-4o-mini"
              />
            </label>

            <label>
              System prompt
              <textarea
                rows={4}
                value={config.systemPrompt}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, systemPrompt: event.target.value }))
                }
              />
            </label>

            <div className="settings-footer">
              <button className="ghost-button" onClick={() => setShowSettings(false)}>
                Close
              </button>
              <button className="primary-button" onClick={() => setShowSettings(false)}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
