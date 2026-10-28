import { useEffect, useState } from 'react'

const STORAGE_KEY = 'chatgpt-clone-settings-v1'
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  systemPrompt: 'You are a helpful assistant.',
}

const buildChatUrl = (baseUrl) => {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '')

  if (!trimmed) {
    return 'https://api.openai.com/v1/chat/completions'
  }

  if (trimmed.endsWith('/chat/completions')) {
    return trimmed
  }

  return `${trimmed}/chat/completions`
}

const getInitialSettings = () => {
  const envApiKey = import.meta.env.VITE_API_KEY || ''
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_SETTINGS.baseUrl
  const envModel = import.meta.env.VITE_MODEL || DEFAULT_SETTINGS.model

  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      return {
        ...DEFAULT_SETTINGS,
        apiKey: envApiKey,
        baseUrl: envBaseUrl,
        model: envModel,
      }
    }

    const parsed = JSON.parse(saved)
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apiKey: parsed.apiKey || envApiKey,
      baseUrl: parsed.baseUrl || envBaseUrl,
      model: parsed.model || envModel,
    }
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      apiKey: envApiKey,
      baseUrl: envBaseUrl,
      model: envModel,
    }
  }
}

const welcomeMessage = {
  role: 'assistant',
  content: 'Hello! I am ready to help. Configure your OpenAI-compatible API settings and start chatting.',
}

const formatError = (error) => {
  if (error instanceof Error) return error.message
  return 'Something unexpected happened.'
}

function App() {
  const [settings, setSettings] = useState(getInitialSettings)
  const [messages, setMessages] = useState([welcomeMessage])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const handleChange = (event) => {
    const { name, value } = event.target
    setSettings((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const trimmed = input.trim()
    if (!trimmed || isLoading) {
      return
    }

    const userMessage = { role: 'user', content: trimmed }
    const nextConversation = [...messages, userMessage]

    setMessages(nextConversation)
    setInput('')
    setIsLoading(true)

    try {
      const apiKey = settings.apiKey || import.meta.env.VITE_API_KEY || ''
      const baseUrl = settings.baseUrl || import.meta.env.VITE_API_BASE_URL || DEFAULT_SETTINGS.baseUrl
      const model = settings.model || import.meta.env.VITE_MODEL || DEFAULT_SETTINGS.model

      if (!apiKey) {
        throw new Error('Add your API key in Settings before chatting.')
      }

      const response = await fetch(buildChatUrl(baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            { role: 'system', content: settings.systemPrompt },
            ...nextConversation,
          ],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMessage = data?.error?.message || `Request failed with status ${response.status}`
        throw new Error(errorMessage)
      }

      const assistantMessage =
        data?.choices?.[0]?.message?.content || 'No response was returned by the model.'

      setMessages((current) => [...current, { role: 'assistant', content: assistantMessage }])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `Error: ${formatError(error)}`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const clearConversation = () => {
    setMessages([welcomeMessage])
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">C</div>
          <div>
            <p className="eyebrow">Desktop App</p>
            <h1>Chat Clone</h1>
          </div>
        </div>

        <button className="secondary-button" type="button" onClick={() => setShowSettings((current) => !current)}>
          {showSettings ? 'Hide settings' : 'Open settings'}
        </button>

        <button className="secondary-button" type="button" onClick={clearConversation}>
          Clear chat
        </button>

        {showSettings && (
          <div className="settings-panel">
            <label>
              <span>API key</span>
              <input
                type="password"
                name="apiKey"
                value={settings.apiKey}
                onChange={handleChange}
                placeholder="sk-..."
              />
            </label>

            <label>
              <span>API base URL</span>
              <input
                type="text"
                name="baseUrl"
                value={settings.baseUrl}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Model</span>
              <input
                type="text"
                name="model"
                value={settings.model}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>System prompt</span>
              <textarea
                name="systemPrompt"
                value={settings.systemPrompt}
                onChange={handleChange}
                rows={4}
              />
            </label>
          </div>
        )}
      </aside>

      <main className="chat-panel">
        <header className="chat-header">
          <div>
            <p className="eyebrow">OpenAI-compatible backend</p>
            <h2>Assistant</h2>
          </div>
        </header>

        <div className="message-list">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`message-row ${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="message-bubble">
                {message.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble typing">Thinking...</div>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message the assistant..."
            rows={1}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSubmit(event)
              }
            }}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="primary-button">
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default App
