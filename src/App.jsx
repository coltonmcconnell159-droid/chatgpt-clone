import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const STORAGE_CONFIG_KEY = 'chatgpt-clone-config';
const STORAGE_CHAT_KEY = 'chatgpt-clone-chats';

const defaultConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  systemPrompt:
    'You are a helpful, concise assistant. Be direct, professional, and clear. Use the complete conversation history when it helps answer the user faithfully.',
  webSearchEnabled: false,
  memoryMode: 'full-history'
};

const createNewChat = (title = 'New chat') => ({
  id:
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `chat-${Date.now()}`,
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

const summarizeTitle = (text) => {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New chat';
  return cleaned.slice(0, 28) + (cleaned.length > 28 ? '…' : '');
};

const normalizeTextFromContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && part.type === 'text' && part.text) return part.text;
        if (part && part.type === 'image_url' && part.image_url?.url) return '[image]';
        return '';
      })
      .join(' ')
      .trim();
  }
  if (content && typeof content === 'object' && content.text) return content.text;
  return '';
};

const normalizeMessageForApi = (message) => {
  const baseContent = message?.content ?? '';

  if (typeof baseContent === 'string') {
    return { role: message.role, content: baseContent };
  }

  if (Array.isArray(baseContent)) {
    return {
      role: message.role,
      content: baseContent.map((part) => {
        if (part && part.type === 'text') {
          return { type: 'text', text: part.text || '' };
        }

        if (part && part.type === 'image_url') {
          return {
            type: 'image_url',
            image_url: { url: part.image_url?.url || '' }
          };
        }

        return { type: 'text', text: '' };
      })
    };
  }

  return { role: message.role, content: String(baseContent || '') };
};

const buildUserMessagePayload = (text, attachedImage) => {
  const content = [];
  if (text && text.trim()) {
    content.push({ type: 'text', text: text.trim() });
  }

  if (attachedImage?.dataUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: attachedImage.dataUrl }
    });
  }

  return {
    role: 'user',
    content: content.length === 1 && content[0].type === 'text' ? content[0].text : content
  };
};

const formatSearchResults = (data) => {
  try {
    const abstract = data?.AbstractText || '';
    const topics = data?.RelatedTopics || [];
    const results = data?.Results || [];

    const selections = [];
    if (abstract) selections.push(`Summary: ${abstract}`);

    for (const topic of topics.slice(0, 4)) {
      if (typeof topic === 'string') selections.push(topic);
      else if (topic?.Text) selections.push(topic.Text);
    }

    for (const result of results.slice(0, 4)) {
      if (result?.Text) selections.push(result.Text);
    }

    return selections.slice(0, 8).join('\n\n') || 'No web results found.';
  } catch {
    return 'No web results found.';
  }
};

async function fetchWebContext(query) {
  const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(
    query
  )}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Web search failed (${response.status})`);
  }

  const data = await response.json();
  return formatSearchResults(data);
}

async function streamChatCompletion({ baseUrl, apiKey, model, messages }) {
  const response = await fetch(`${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      stream: true
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed (${response.status}): ${text.slice(0, 220) || 'Unknown error'}`);
  }

  if (!response.body) {
    throw new Error('Streaming is not supported by this endpoint.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let payload = '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          payload = line.slice(5).trim();
        }
      }

      if (!payload || payload === '[DONE]') continue;

      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          fullText += delta;
        }
      } catch {
        // ignore malformed stream chunk
      }
    }
  }

  if (buffer.trim()) {
    const lines = buffer.split('\n');
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') {
            fullText += delta;
          }
        } catch {
          // ignore malformed stream chunk
        }
      }
    }
  }

  return fullText;
}

function updateAssistantMessage(setChats, chatId, content) {
  setChats((previous) =>
    previous.map((chat) => {
      if (chat.id !== chatId) return chat;

      const nextMessages = [...chat.messages];
      if (nextMessages.length === 0) {
        nextMessages.push({ role: 'assistant', content });
        return { ...chat, messages: nextMessages };
      }

      const lastIndex = nextMessages.length - 1;
      if (nextMessages[lastIndex]?.role === 'assistant') {
        nextMessages[lastIndex] = { ...nextMessages[lastIndex], content };
      } else {
        nextMessages.push({ role: 'assistant', content });
      }

      return { ...chat, messages: nextMessages };
    })
  );
}

function App() {
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);
  const recognitionRef = useRef(null);

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
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : 'welcome-chat',
        title: 'Welcome',
        messages: [
          {
            role: 'assistant',
            content:
              'Welcome! Configure your OpenAI-compatible API in settings, then start chatting. Full-history memory and image + web-search tools are enabled in this build.'
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
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [attachedImage, setAttachedImage] = useState(null);

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
    setAttachedImage(null);
    setError('');
  };

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    setError('');
  };

  const handleRenameActiveChat = () => {
    if (!activeChat) return;
    const nextName = window.prompt('Rename chat', activeChat.title || 'New chat');
    if (nextName === null) return;

    const trimmed = nextName.trim();
    if (!trimmed) return;

    setChats((previous) =>
      previous.map((chat) => (chat.id === activeChat.id ? { ...chat, title: trimmed } : chat))
    );
  };

  const handleDeleteChat = (chatId) => {
    setChats((previous) => {
      const nextChats = previous.filter((chat) => chat.id !== chatId);
      if (nextChats.length === 0) {
        const fresh = createNewChat('New chat');
        setActiveChatId(fresh.id);
        return [fresh];
      }

      if (chatId === activeChatId && nextChats[0]) {
        setActiveChatId(nextChats[0].id);
      }

      return nextChats;
    });
  };

  const handleImagePick = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachedImage({
        name: file.name,
        size: file.size,
        mime: file.type,
        dataUrl: String(reader.result || '')
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleExportChats = () => {
    const blob = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-history.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportChats = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = safeJsonParse(String(reader.result), null);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('Import file is not a valid chat history array.');
        }

        setChats(parsed);
        setActiveChatId(parsed[0].id);
        setError('');
      } catch (uploadError) {
        setError(uploadError.message || 'Could not import that chat history file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleVoiceToggle = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      window.mozSpeechRecognition ||
      null;

    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser.');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setDraft((previous) => (previous ? `${previous} ${transcript}` : transcript));
      }
    };

    recognition.onerror = () => {
      setError('Voice input encountered an error. Please try again.');
      setIsListening(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const handleSendMessage = async () => {
    if ((!draft.trim() && !attachedImage) || isLoading) {
      return;
    }

    const userText = draft.trim();
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

    let webContext = '';
    if (config.webSearchEnabled && userText) {
      try {
        setIsSearching(true);
        webContext = await fetchWebContext(userText);
      } catch (searchError) {
        console.warn(searchError);
        setError('Web search failed, but the chat request will continue without browsing context.');
      } finally {
        setIsSearching(false);
      }
    }

    const userContent = buildUserMessagePayload(
      webContext ? `${userText}\n\nWeb context:\n${webContext}` : userText,
      attachedImage
    );

    const conversationBeforeSend = activeChat?.messages || [];
    const userPayload = { role: 'user', content: userContent.content };
    const assistantPlaceholder = { role: 'assistant', content: 'Thinking…' };

    setChats((previous) =>
      previous.map((chat) => {
        if (chat.id !== activeChatId) {
          return chat;
        }

        const nextTitle =
          chat.title === 'New chat' ? summarizeTitle(userText || 'Image message') : chat.title;

        return {
          ...chat,
          title: nextTitle,
          messages: [...chat.messages, userContent, assistantPlaceholder]
        };
      })
    );

    setDraft('');
    setAttachedImage(null);
    setIsLoading(true);
    setError('');

    try {
      const systemMessages = config.systemPrompt.trim()
        ? [{ role: 'system', content: config.systemPrompt.trim() }]
        : [];

      const normalizedHistory = conversationBeforeSend.map((message) => normalizeMessageForApi(message));
      const requestMessages = [...systemMessages, ...normalizedHistory, normalizeMessageForApi(userPayload)];

      const streamingReply = await streamChatCompletion({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: requestMessages
      });

      updateAssistantMessage(setChats, activeChatId, streamingReply || 'The API responded without content.');
    } catch (requestError) {
      updateAssistantMessage(setChats, activeChatId, `Error: ${requestError.message}`);
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
            <div key={chat.id} className={`chat-row-wrap ${chat.id === activeChatId ? 'active' : ''}`}>
              <button
                className="chat-row"
                onClick={() => handleSelectChat(chat.id)}
              >
                <span className="chat-row-title">{chat.title}</span>
              </button>
              <button
                className="chat-delete"
                aria-label={`Delete ${chat.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleDeleteChat(chat.id);
                }}
              >
                ×
              </button>
            </div>
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
            <button className="ghost-button" onClick={handleRenameActiveChat}>
              Rename
            </button>
            <button className="ghost-button" onClick={handleExportChats}>
              Export
            </button>
            <button className="ghost-button" onClick={() => importInputRef.current?.click()}>
              Import
            </button>
            <input ref={importInputRef} type="file" accept="application/json" hidden onChange={handleImportChats} />
            <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Open settings">
              ⚙️
            </button>
          </div>
        </header>

        <div className="conversation-wrap">
          {activeChat?.messages.length ? (
            <div className="messages">
              {activeChat.messages.map((message, index) => {
                const textContent = normalizeTextFromContent(message.content);
                const imageAttachment = Array.isArray(message.content)
                  ? message.content.find((part) => part?.type === 'image_url')
                  : null;

                return (
                  <div
                    key={`${message.role}-${index}`}
                    className={`message-row ${message.role === 'user' ? 'user' : 'assistant'}`}
                  >
                    <div className="avatar">{message.role === 'user' ? 'U' : 'AI'}</div>
                    <div className="message-bubble">
                      {imageAttachment && (
                        <img
                          className="attached-preview"
                          src={imageAttachment.image_url?.url}
                          alt="Uploaded attachment"
                        />
                      )}
                      {message.role === 'assistant' && textContent ? (
                        <div className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                        </div>
                      ) : textContent ? (
                        <div className="message-text">{textContent}</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
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
          <div className="composer-tools">
            <label className="toggle-pill">
              <input
                type="checkbox"
                checked={Boolean(config.webSearchEnabled)}
                onChange={(event) =>
                  setConfig((previous) => ({
                    ...previous,
                    webSearchEnabled: event.target.checked
                  }))
                }
              />
              Web browse
            </label>
            <span className="feature-badge">Full history memory</span>
            {isSearching && <span className="feature-badge muted">Browsing…</span>}
          </div>

          <div className="composer">
            <button
              className="attach-button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload image"
            >
              📎
            </button>
            <button
              className={`voice-button ${isListening ? 'active' : ''}`}
              onClick={handleVoiceToggle}
              aria-label="Voice input"
            >
              🎙️
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImagePick}
            />

            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                config.webSearchEnabled
                  ? 'Ask a question or browse the web…'
                  : 'Message the assistant…'
              }
            />
            <button className="send-button" onClick={handleSendMessage} disabled={isLoading || (!draft.trim() && !attachedImage)}>
              {isLoading ? '...' : 'Send'}
            </button>
          </div>

          {attachedImage && (
            <div className="attachment-preview">
              <span>{attachedImage.name}</span>
              <button className="remove-attachment" onClick={() => setAttachedImage(null)}>
                Remove
              </button>
            </div>
          )}
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

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={Boolean(config.webSearchEnabled)}
                onChange={(event) =>
                  setConfig((previous) => ({
                    ...previous,
                    webSearchEnabled: event.target.checked
                  }))
                }
              />
              Enable web browsing (DuckDuckGo results)
            </label>

            <label className="toggle-row">
              <input type="checkbox" checked readOnly />
              Full-history memory enabled
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
