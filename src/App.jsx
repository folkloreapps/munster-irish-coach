import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are Finbar, a warm, patient and funny Munster Irish (Gaeilge na Mumhan) conversation coach. You help complete beginners learn conversational Irish through natural, friendly dialogue.

DIALECT: Always use Munster Irish — Kerry/Cork dialect specifically.

YOUR TEACHING APPROACH:
- Introduce only 1-3 new Irish words per response. Never overwhelm.
- Teach through conversation, not lectures.
- Be warm and encouraging. Celebrate small wins.
- Correct gently by modeling the right form.
- Use practical phrases first: greetings, introductions, feelings.

ALWAYS respond with valid JSON:
{
  "message": "Your response weaving in Irish naturally. Use **bold** around Irish words.",
  "message_spoken": "Same message but replace Irish words with phonetic pronunciation for text-to-speech (e.g. replace 'Dia duit' with 'JEE-uh GWITCH')",
  "words": [{"irish": "...", "phonetic": "...", "munster_note": "...", "english": "..."}],
  "suggestions": ["reply 1", "reply 2", "reply 3"]
}

PHONETIC RULES: Capital letters for stressed syllables. Familiar English sounds. For Munster: stress often on 2nd syllable; ao = ee in Kerry Irish.

Start by greeting the user, introducing yourself as Finbar, and teaching Dia duit (hello).`;

function PronunciationCard({ word }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button onClick={() => setExpanded(!expanded)}
      style={{margin:"4px",display:"inline-flex",flexDirection:"column",alignItems:"flex-start",borderRadius:"8px",border:"1px solid #a7f3d0",background:"#ecfdf5",padding:"8px 12px",textAlign:"left",cursor:"pointer"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
        <span style={{fontSize:"14px",fontWeight:"bold",color:"#064e3b"}}>{word.irish}</span>
        <span style={{borderRadius:"9999px",background:"#059669",padding:"2px 8px",fontSize:"11px",fontWeight:"600",color:"white"}}>{word.phonetic}</span>
        <span style={{fontSize:"11px",color:"#059669"}}>{expanded?"▲":"▼"}</span>
      </div>
      <span style={{marginTop:"4px",fontSize:"11px",color:"#047857",fontStyle:"italic"}}>"{word.english}"</span>
      {expanded && word.munster_note && (
        <div style={{marginTop:"8px",borderRadius:"6px",background:"#fffbeb",border:"1px solid #fcd34d",padding:"4px 8px",fontSize:"11px",color:"#92400e"}}>
          🗺️ <strong>Munster note:</strong> {word.munster_note}
        </div>
      )}
    </button>
  );
}

function Bubble({ msg, onSpeak }) {
  const isCoach = msg.role === "coach";
  const render = (text) => text.split(/(\*\*[^*]+\*\*)/g).map((p,i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <span key={i} style={{fontWeight:"600",color:"#065f46",background:"#d1fae5",padding:"0 4px",borderRadius:"3px"}}>{p.slice(2,-2)}</span>
      : <span key={i}>{p}</span>
  );
  return (
    <div style={{display:"flex",gap:"12px",justifyContent:isCoach?"flex-start":"flex-end",marginBottom:"16px"}}>
      {isCoach && (
        <div style={{flexShrink:0,width:"36px",height:"36px",borderRadius:"50%",background:"#065f46",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>🌿</div>
      )}
      <div style={{maxWidth:"480px"}}>
        {isCoach && <p style={{fontSize:"11px",fontWeight:"600",color:"#059669",marginBottom:"4px",marginLeft:"4px"}}>Finbar — Munster Irish Coach</p>}
        <div style={{borderRadius:isCoach?"16px 16px 16px 4px":"16px 16px 4px 16px",padding:"12px 16px",fontSize:"14px",lineHeight:"1.6",background:isCoach?"white":"#065f46",color:isCoach?"#1f2937":"white",border:isCoach?"1px solid #f3f4f6":"none",boxShadow:"0 1px 3px rgba(0,0,0,0.1)"}}>
          {isCoach ? render(msg.text) : msg.text}
        </div>
        {isCoach && (
          <div style={{marginTop:"6px",marginLeft:"4px",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
            <button onClick={() => onSpeak(msg.text)}
              style={{fontSize:"11px",color:"#059669",background:"none",border:"1px solid #a7f3d0",borderRadius:"9999px",padding:"3px 10px",cursor:"pointer"}}>
              🔈 Hear this
            </button>
            {msg.words?.length > 0 && (
              <span style={{fontSize:"11px",color:"#9ca3af",fontWeight:"600",textTransform:"uppercase",letterSpacing:"0.05em"}}>🔊 Tap for pronunciation:</span>
            )}
          </div>
        )}
        {isCoach && msg.words?.length > 0 && (
          <div style={{marginTop:"4px",marginLeft:"4px",display:"flex",flexWrap:"wrap"}}>
            {msg.words.map((w,i) => <PronunciationCard key={i} word={w}/>)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [started, setStarted] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const history = useRef([]);
  const recognitionRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages, loading]);

  const audioRef = useRef(null);

  const speak = async (text) => {
    const clean = text.replace(/\*\*/g, "");
    try {
      setSpeaking(true);
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean })
      });
      if (!res.ok) {
        console.error('Voice API failed, falling back to system voice');
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
        setSpeaking(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      audio.play();
    } catch (err) {
      console.error('Voice error:', err);
      setSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  // Speech to text
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Sorry, your browser doesn't support voice input. Try Chrome!");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IE";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onerror = (e) => {
      if (e.error !== 'no-speech') {
        console.log('Speech error:', e.error);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  };
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IE";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const callClaude = async (userMsg) => {
    setLoading(true); setError(null);
    if (userMsg) history.current.push({role:"user", content:userMsg});
    const msgs = history.current.length > 0 ? history.current : [{role:"user", content:"Please start the lesson!"}];
    try {
      const res = await fetch("/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-20250514", max_tokens:1000, system:SYSTEM_PROMPT, messages:msgs})
      });
      const data = await res.json();
      console.log('API response:', data);
      const raw = data.content?.[0]?.text || "";
      let parsed;
      try { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : raw); }
      catch { parsed = {message:raw, words:[], suggestions:[]}; }
      history.current.push({role:"assistant", content:raw});
      const coachMsg = {role:"coach", text:parsed.message, words:parsed.words||[]};
      setMessages(prev => [...prev, coachMsg]);
      setSuggestions(parsed.suggestions||[]);
      // Auto-speak Finbar's response
      setTimeout(() => speak(parsed.message_spoken || parsed.message), 300);
    } catch { setError("Couldn't connect to Finbar. Please try again."); }
    finally { setLoading(false); }
  };

  const send = (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    stopSpeaking();
    setMessages(prev => [...prev, {role:"user", text:msg}]);
    setInput(""); setSuggestions([]);
    callClaude(msg);
    inputRef.current?.focus();
  };

  if (!authenticated) {
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#064e3b,#065f46,#0f766e)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
        <div style={{background:"white",borderRadius:"24px",padding:"40px",maxWidth:"400px",width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{fontSize:"48px",marginBottom:"16px"}}>🔐</div>
          <h2 style={{fontSize:"24px",fontWeight:"800",color:"#064e3b",marginBottom:"8px"}}>Munster Irish Coach</h2>
          <p style={{color:"#6b7280",fontSize:"14px",marginBottom:"24px"}}>Enter password to continue</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && password === "luke123") {
                setAuthenticated(true);
              }
            }}
            placeholder="Password"
            style={{width:"100%",padding:"12px 16px",borderRadius:"12px",border:"2px solid #e5e7eb",fontSize:"16px",marginBottom:"16px",outline:"none",fontFamily:"inherit"}}
          />
          <button
            onClick={() => {
              if (password === "luke123") {
                setAuthenticated(true);
              } else {
                alert("Incorrect password");
              }
            }}
            style={{width:"100%",background:"#065f46",color:"white",fontWeight:"700",fontSize:"16px",padding:"12px",borderRadius:"12px",border:"none",cursor:"pointer"}}>
            Unlock
          </button>
        </div>
      </div>
    );
  }

  if (!started) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#064e3b,#065f46,#0f766e)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{textAlign:"center",maxWidth:"400px",width:"100%"}}>
        <div style={{fontSize:"64px",marginBottom:"16px"}}>🍀</div>
        <h1 style={{fontSize:"36px",fontWeight:"800",color:"white",margin:"0 0 8px"}}>Fáilte Romhat</h1>
        <p style={{color:"#6ee7b7",fontSize:"16px",fontStyle:"italic",margin:"0 0 8px"}}>"Welcome" — your Munster Irish journey starts here</p>
        <div style={{width:"64px",height:"2px",background:"#34d399",margin:"24px auto",borderRadius:"2px"}}/>
        <p style={{color:"#d1fae5",fontSize:"15px",lineHeight:"1.7",margin:"0 0 32px"}}>
          Meet <strong>Finbar</strong>, your Munster Irish coach. He'll teach you real conversational Irish — the way it's spoken in Kerry and Cork — and you can talk to him by voice or typing!
        </p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",marginBottom:"32px"}}>
          {[{icon:"🎤",label:"Voice Input"},{icon:"🔈",label:"Spoken Replies"},{icon:"🗺️",label:"Munster Dialect"}].map(f=>(
            <div key={f.label} style={{background:"rgba(255,255,255,0.1)",borderRadius:"12px",padding:"12px",textAlign:"center"}}>
              <div style={{fontSize:"24px",marginBottom:"4px"}}>{f.icon}</div>
              <div style={{fontSize:"11px",color:"#a7f3d0",fontWeight:"600"}}>{f.label}</div>
            </div>
          ))}
        </div>
        <button onClick={()=>{setStarted(true); callClaude(null);}}
          style={{width:"100%",background:"white",color:"#064e3b",fontWeight:"800",fontSize:"18px",padding:"16px",borderRadius:"16px",border:"none",cursor:"pointer",boxShadow:"0 10px 25px rgba(0,0,0,0.3)"}}>
          Tosaigh — Let's Begin! 🌿
        </button>
        <p style={{color:"#6ee7b7",fontSize:"12px",marginTop:"12px"}}>No Irish knowledge needed</p>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#f9fafb"}}>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      {/* Header */}
      <div style={{background:"#065f46",color:"white",padding:"12px 16px",display:"flex",alignItems:"center",gap:"12px",boxShadow:"0 2px 8px rgba(0,0,0,0.2)",flexShrink:0}}>
        <div style={{width:"40px",height:"40px",borderRadius:"50%",background:"#047857",border:"2px solid #6ee7b7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",flexShrink:0}}>🌿</div>
        <div>
          <div style={{fontWeight:"700",fontSize:"15px"}}>Finbar — Irish Coach</div>
          <div style={{color:"#6ee7b7",fontSize:"12px"}}>Gaeilge na Mumhan • Kerry & Cork dialect</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"8px"}}>
          <button
  onClick={() => window.open('https://docs.google.com/forms/d/e/1FAIpQLSdBWbGLo5P8fyJKGGzhuOIQNBKX0R7vWdtoqVxx_-WbzeXZ1Q/viewform', '_blank')}
  style={{background:"rgba(255,255,255,0.15)",border:"none",color:"white",borderRadius:"9999px",padding:"6px 12px",fontSize:"12px",cursor:"pointer",fontWeight:"600"}}>
  🐛 Report Bug
</button>
          {speaking && (
            <button onClick={stopSpeaking}
              style={{background:"rgba(255,255,255,0.15)",border:"none",color:"white",borderRadius:"9999px",padding:"4px 10px",fontSize:"12px",cursor:"pointer"}}>
              ⏹ Stop
            </button>
          )}
          <span style={{width:"8px",height:"8px",borderRadius:"50%",background:"#34d399",display:"inline-block",animation:"bounce 2s infinite"}}/>
          <span style={{color:"#6ee7b7",fontSize:"12px"}}>Live</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
        {messages.map((msg,i) => <Bubble key={i} msg={msg} onSpeak={speak}/>)}
        {loading && (
          <div style={{display:"flex",gap:"12px",marginBottom:"16px"}}>
            <div style={{flexShrink:0,width:"36px",height:"36px",borderRadius:"50%",background:"#065f46",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>🌿</div>
            <div style={{background:"white",borderRadius:"16px 16px 16px 4px",border:"1px solid #f3f4f6",padding:"12px 16px",display:"flex",gap:"4px",alignItems:"center"}}>
              {[0,150,300].map((d,i)=><span key={i} style={{width:"8px",height:"8px",borderRadius:"50%",background:"#34d399",display:"inline-block",animation:`bounce 1s ${d}ms infinite`}}/>)}
            </div>
          </div>
        )}
        {error && <div style={{textAlign:"center",color:"#ef4444",fontSize:"14px",padding:"8px"}}>{error}</div>}
        <div ref={bottomRef}/>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && !loading && (
        <div style={{padding:"8px 16px",flexShrink:0}}>
          <p style={{fontSize:"11px",color:"#9ca3af",marginBottom:"8px",fontWeight:"600"}}>💡 Suggested replies:</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {suggestions.map((s,i)=>(
              <button key={i} onClick={()=>send(s)}
                style={{background:"white",border:"1px solid #6ee7b7",color:"#065f46",fontSize:"13px",borderRadius:"9999px",padding:"6px 16px",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,0.1)"}}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{background:"white",borderTop:"1px solid #e5e7eb",padding:"12px 16px",flexShrink:0}}>
        <div style={{display:"flex",gap:"8px",alignItems:"flex-end"}}>
          {/* Mic button */}
          <button
            onClick={listening ? stopListening : startListening}
            style={{flexShrink:0,width:"44px",height:"44px",borderRadius:"50%",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",background:listening?"#dc2626":"#065f46",boxShadow:"0 2px 6px rgba(0,0,0,0.2)",animation:listening?"pulse 1s infinite":"none"}}>
            {listening ? "⏹" : "🎤"}
          </button>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={listening ? "Listening... speak now!" : "Type or use the mic..."}
            rows={1}
            style={{flex:1,resize:"none",borderRadius:"12px",border:"1px solid #e5e7eb",padding:"10px 16px",fontSize:"14px",outline:"none",background:listening?"#fef2f2":"#f9fafb",maxHeight:"100px",fontFamily:"inherit",transition:"background 0.2s"}}
          />
          <button onClick={()=>send()} disabled={!input.trim()||loading}
            style={{background:input.trim()&&!loading?"#065f46":"#d1d5db",color:"white",borderRadius:"12px",padding:"10px 16px",fontWeight:"700",fontSize:"14px",border:"none",cursor:input.trim()&&!loading?"pointer":"default",flexShrink:0}}>
            Seol ↑
          </button>
        </div>
        <p style={{textAlign:"center",color:"#9ca3af",fontSize:"11px",marginTop:"8px"}}>
          {listening ? "🔴 Listening — speak now, or tap ⏹ to stop" : "🎤 Tap mic to speak • Enter to send • Tap 🔈 to hear Finbar"}
        </p>
      </div>
    </div>
  );