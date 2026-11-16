
"use client";

import { useEffect, useRef, useState } from "react";

import type {
  WebWorkerMLCEngine,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";

const MODEL = "Qwen3-0.6B-q4f32_1-MLC";

type Message = {
  role: "user" | "assistant";
  content: string;
};

let engine: WebWorkerMLCEngine | null = null;

let enginePromise: Promise<WebWorkerMLCEngine> | null = null;

let aiWorker: Worker | null = null;

async function getAI(
  onProgress: (text: string) => void
): Promise<WebWorkerMLCEngine> {

  if (engine) return engine;

  if (enginePromise) return enginePromise;

  enginePromise = (async () => {

    try {

      const {
        WebWorkerMLCEngine,
        prebuiltAppConfig,
      } = await import("@mlc-ai/web-llm");

      aiWorker = new Worker(
        new URL(
          "./worker/web-worker.ts",
          import.meta.url
        ),
        {
          type: "module",
        }
      );

      const ai = new WebWorkerMLCEngine(
        aiWorker,
        {
          appConfig: {
            ...prebuiltAppConfig,
            cacheBackend: "indexeddb",
          },

          logLevel: "WARN",

          initProgressCallback: report => {
            onProgress(report.text);
          },
        }
      );

      onProgress("Starting BINNU AI...");

      await ai.reload(MODEL, {
        context_window_size: 1024,
      });

      engine = ai;

      return ai;

    } catch (error) {

      aiWorker?.terminate();

      aiWorker = null;
      engine = null;

      throw error;

    } finally {

      enginePromise = null;

    }

  })();

  return enginePromise;
}

export default function BINNUAI() {

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [input, setInput] =
    useState("");

  const [status, setStatus] =
    useState("AI not loaded");

  const [ready, setReady] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const history = useRef<Message[]>([]);

  const locked = useRef(false);

  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "BINNU AI";
  }, []);

  useEffect(() => {

    bottom.current?.scrollIntoView({
      block: "end",
    });

  }, [messages]);

  async function loadModel() {

    if (engine) {

      setReady(true);

      return engine;
    }

    setLoading(true);

    try {

      const ai = await getAI(setStatus);

      setReady(true);

      setStatus("● AI Ready");

      return ai;

    } catch (error: any) {

      setReady(false);

      setStatus(
        "AI Error: " +
        (error?.message || String(error))
      );

      throw error;

    } finally {

      setLoading(false);

    }
  }

  async function startAI() {

    try {

      await loadModel();

    } catch (error) {

      console.error(error);

    }
  }

  async function sendMessage(
    customText?: string
  ) {

    const text =
      (customText || input).trim();

    if (!text || locked.current) return;

    locked.current = true;

    setBusy(true);

    setInput("");

    setMessages(previous => [

      ...previous,

      {
        role: "user",
        content: text,
      },

      {
        role: "assistant",
        content: "Thinking...",
      },

    ]);

    function updateReply(answer: string) {

      setMessages(previous =>

        previous.map((message, index) =>

          index === previous.length - 1

            ? {
                role: "assistant",
                content: answer,
              }

            : message

        )
      );
    }

    try {

      if (!engine) {
        updateReply("Loading AI model...");
      }

      const ai = await loadModel();

      setStatus("Generating reply...");

      updateReply("Thinking...");

      const conversation:
        ChatCompletionMessageParam[] = [

        {
          role: "system",

          content:
            "You are BINNU AI, a helpful multilingual AI assistant. Always reply in the user's language. Give short, accurate and useful answers. You can understand Telugu, English, Hindi and many other languages.",
        },

        ...history.current
          .slice(-2)
          .map(message => ({

            ...message,

            content:
              message.content.slice(0, 250),

          })),

        {
          role: "user",
          content: text,
        },

      ];

      const stream =
        await ai.chat.completions.create({

          messages: conversation,

          stream: true,

          max_tokens: 96,

          temperature: 0.5,

          top_p: 0.9,

          extra_body: {
            enable_thinking: false,
          },

        });

      let answer = "";

      for await (const chunk of stream) {

        const token =
          chunk.choices[0]?.delta?.content || "";

        answer += token;

        if (token) {

          updateReply(answer);

        }
      }

      if (!answer.trim()) {

        throw new Error(
          "AI returned an empty reply."
        );

      }

      history.current.push(

        {
          role: "user",
          content: text,
        },

        {
          role: "assistant",
          content: answer,
        }

      );

      setStatus("● AI Ready");

    } catch (error: any) {

      const message =
        error?.message || String(error);

      updateReply(
        "AI Error: " + message
      );

      setStatus("AI Error");

      if (
        /disposed|device lost/i.test(message)
      ) {

        aiWorker?.terminate();

        aiWorker = null;

        engine = null;

        enginePromise = null;

        setReady(false);

        setStatus(
          "GPU error. Try sending again."
        );

      }

    } finally {

      locked.current = false;

      setBusy(false);

    }
  }

  function newChat() {

    if (locked.current) return;

    history.current = [];

    setMessages([]);

    setInput("");

  }

  return (

    <div id="binnu-app">

      <style>{`

        #binnu-app {

          position: fixed;
          inset: 0;
          display: flex;
          background: #080b10;
          color: #f4f6fa;
          font-family: Arial, sans-serif;
          overflow: hidden;
          z-index: 100;

        }

        #binnu-app * {

          box-sizing: border-box;

        }

        #binnu-app button {

          cursor: pointer;
          font-family: inherit;
          font-weight: 700;
          border: none;

        }

        #binnu-app button:disabled {

          opacity: .45;
          cursor: not-allowed;

        }

        #binnu-app .sidebar {

          width: 250px;
          background: #121720;
          border-right: 1px solid #252d3b;
          padding: 24px 18px;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;

        }

        #binnu-app .brand {

          font-size: 28px;
          font-weight: 900;
          color: #a6ff72;
          letter-spacing: 2px;

        }

        #binnu-app .subtitle {

          font-size: 11px;
          color: #8995aa;
          margin-top: 10px;
          margin-bottom: 30px;
          letter-spacing: 1px;

        }

        #binnu-app .primary {

          color: #081009;
          background: #a6ff72;
          padding: 14px 20px;
          border-radius: 12px;
          font-size: 14px;

        }

        #binnu-app .primary:hover {

          background: #c0ff9c;

        }

        #binnu-app .sidebar-info {

          margin-top: auto;
          color: #8995aa;
          font-size: 12px;
          line-height: 2;

        }

        #binnu-app .main {

          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;

        }

        #binnu-app .header {

          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 24px;
          border-bottom: 1px solid #252d3b;
          background: #10151d;
          gap: 12px;

        }

        #binnu-app .heading {

          font-size: 18px;
          color: #a6ff72;
          font-weight: 800;
          letter-spacing: 2px;
          white-space: nowrap;

        }

        #binnu-app .status {

          font-size: 12px;
          color: #a6ff72;
          overflow-wrap: anywhere;
          text-align: right;
          max-width: 65%;

        }

        #binnu-app .messages {

          flex: 1;
          overflow-y: auto;
          padding: 24px;

        }

        #binnu-app .welcome {

          max-width: 650px;
          margin: 50px auto;
          text-align: center;

        }

        #binnu-app .symbol {

          width: 84px;
          height: 84px;
          margin: auto;
          border: 1px solid #a6ff72;
          border-radius: 24px;
          color: #a6ff72;
          background: #142219;
          display: grid;
          place-items: center;
          font-size: 42px;
          box-shadow: 0 0 35px #a6ff7220;

        }

        #binnu-app h1 {

          margin: 25px 0 12px;
          font-size: 32px;
          color: white;

        }

        #binnu-app p {

          color: #8995aa;
          line-height: 1.7;

        }

        #binnu-app .examples {

          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 30px;

        }

        #binnu-app .example {

          background: #151b25;
          color: #f4f6fa;
          border: 1px solid #283242;
          text-align: left;
          padding: 20px;
          border-radius: 14px;
          line-height: 1.6;

        }

        #binnu-app .example:hover {

          border-color: #a6ff72;

        }

        #binnu-app .bubble {

          max-width: 850px;
          margin: 18px auto;
          padding: 18px;
          border-radius: 15px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          line-height: 1.75;

        }

        #binnu-app .user {

          background: #213423;
          border: 1px solid #35513a;

        }

        #binnu-app .assistant {

          background: #151b25;
          border: 1px solid #283242;

        }

        #binnu-app .role {

          color: #a6ff72;
          font-size: 11px;
          font-weight: 800;
          margin-bottom: 10px;
          letter-spacing: 1px;

        }

        #binnu-app .composer {

          padding: 18px;
          background: #10151d;
          border-top: 1px solid #252d3b;

        }

        #binnu-app .input-box {

          max-width: 850px;
          display: flex;
          margin: auto;
          background: #171e29;
          border: 1px solid #303a4b;
          border-radius: 16px;
          padding: 10px;
          gap: 10px;
          align-items: center;

        }

        #binnu-app textarea {

          flex: 1;
          min-width: 0;
          width: 100%;
          resize: none;
          outline: none;
          border: none;
          background: transparent;
          color: white;
          padding: 12px;
          font: inherit;

        }

        #binnu-app .send {

          background: #a6ff72;
          color: #081009;
          width: 46px;
          height: 46px;
          border-radius: 12px;
          font-size: 24px;
          flex-shrink: 0;

        }

        #binnu-app .footer {

          color: #8995aa;
          font-size: 11px;
          margin-top: 12px;
          text-align: center;

        }

        #binnu-app .mobile-new {

          display: none;

        }

        @media(max-width: 700px) {

          #binnu-app .sidebar {

            display: none;

          }

          #binnu-app .header {

            padding: 14px;

          }

          #binnu-app .messages {

            padding: 14px;

          }

          #binnu-app .welcome {

            margin-top: 25px;

          }

          #binnu-app h1 {

            font-size: 26px;

          }

          #binnu-app .examples {

            grid-template-columns: 1fr;

          }

          #binnu-app .mobile-new {

            display: block;
            background: #252d3b;
            color: white;
            border-radius: 8px;
            padding: 8px;

          }

        }

      `}</style>

      <aside className="sidebar">

        <div className="brand">
          BINNU AI
        </div>

        <div className="subtitle">
          YOUR PERSONAL AI ASSISTANT
        </div>

        <button
          className="primary"
          onClick={newChat}
          disabled={busy}
        >
          + New Chat
        </button>

        <div className="sidebar-info">

          BINNU AI 4.1

          <br />

          FAST MODE

          <br />

          Qwen3 Multilingual

          <br />

          Local Browser AI

          <br />

          No API Key Required

        </div>

      </aside>

      <main className="main">

        <header className="header">

          <button
            className="mobile-new"
            onClick={newChat}
            disabled={busy}
          >
            +
          </button>

          <div className="heading">
            BINNU AI
          </div>

          <div className="status">
            {status}
          </div>

        </header>

        <section className="messages">

          {messages.length === 0 && (

            <div className="welcome">

              <div className="symbol">
                ✦
              </div>

              <h1>
                How can I help you?
              </h1>

              <p>
                Hello! I am BINNU AI.
                Ask me anything in your language.
              </p>

              <button
                className="primary"
                onClick={startAI}
                disabled={
                  loading || busy || ready
                }
              >

                {ready
                  ? "✓ AI Ready"
                  : loading
                  ? "Loading AI..."
                  : "Start BINNU AI"}

              </button>

              <div className="examples">

                <button
                  className="example"
                  disabled={busy}
                  onClick={() =>

                    sendMessage(
                      "Explain artificial intelligence."
                    )

                  }
                >
                  ✦ Learn something new
                </button>

                <button
                  className="example"
                  disabled={busy}
                  onClick={() =>

                    sendMessage(
                      "Write a simple HTML website."
                    )

                  }
                >
                  &lt;/&gt; Coding help
                </button>

                <button
                  className="example"
                  disabled={busy}
                  onClick={() =>

                    sendMessage(
                      "తెలుగులో ఒక చిన్న కథ చెప్పు."
                    )

                  }
                >
                  ✦ Speak in Telugu
                </button>

                <button
                  className="example"
                  disabled={busy}
                  onClick={() =>

                    sendMessage(
                      "हिंदी में विज्ञान के बारे में बताओ।"
                    )

                  }
                >
                  ✦ Speak in Hindi
                </button>

              </div>

            </div>

          )}

          {messages.map((message, index) => (

            <div
              key={index}
              className={
                "bubble " + message.role
              }
            >

              <div className="role">

                {message.role === "user"
                  ? "YOU"
                  : "BINNU AI"}

              </div>

              {message.content}

            </div>

          ))}

          <div ref={bottom} />

        </section>

        <footer className="composer">

          <div className="input-box">

            <textarea

              value={input}

              maxLength={400}

              rows={2}

              placeholder="Ask BINNU AI anything..."

              onChange={event =>

                setInput(event.target.value)

              }

              onKeyDown={event => {

                if (

                  event.key === "Enter" &&

                  !event.shiftKey &&

                  !event.nativeEvent.isComposing

                ) {

                  event.preventDefault();

                  sendMessage();

                }

              }}

            />

            <button

              className="send"

              disabled={
                busy || !input.trim()
              }

              onClick={() => sendMessage()}

            >
              ↑
            </button>

          </div>

          <div className="footer">

            BINNU AI 4.1 · Fast Mode
            · Multilingual Assistant

          </div>

        </footer>

      </main>

    </div>

  );
}
