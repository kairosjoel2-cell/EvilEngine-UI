(() => {
  const $ = (id) => document.getElementById(id);
  let supabase = null;
  let currentUser = null;
  let currentConversation = null;
  let conversations = [];
  let messages = [];
  let authMode = "signin";
  let busy = false;

  const welcome = $("welcome");
  const thread = $("chat-thread");
  const input = $("prompt-input");
  const sendButton = $("send-button");

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    window.setTimeout(() => el.classList.remove("show"), 2800);
  }

  function setAuthMessage(message, isError = false) {
    $("auth-message").textContent = message;
    $("auth-message").style.color = isError ? "#ffad9e" : "#a9c5ff";
  }

  function openAuth(mode = "signin") {
    setAuthMode(mode);
    $("auth-modal").classList.remove("hidden");
    $("auth-email").focus();
  }

  function closeAuth() {
    $("auth-modal").classList.add("hidden");
    setAuthMessage("");
  }

  function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll(".auth-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === mode));
    $("auth-title").textContent = mode === "signup" ? "Create your account" : "Welcome to Kairos GPT";
    $("auth-subtitle").textContent = mode === "signup" ? "Create an account to save your conversations." : "Sign in to continue your conversations.";
    $("auth-submit").textContent = mode === "signup" ? "Create account" : "Sign in";
    $("auth-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
    setAuthMessage("");
  }

  function updateAccountUI() {
    const signedIn = Boolean(currentUser);
    $("top-signin").classList.toggle("hidden", signedIn);
    $("top-profile").classList.toggle("hidden", !signedIn);
    $("signin-note").classList.toggle("hidden", signedIn);
    $("account-name").textContent = signedIn ? (currentUser.email || "Your account") : "Guest";
    $("account-status").textContent = signedIn ? "Signed in" : "Not signed in";
    const initial = signedIn ? (currentUser.email || "K").charAt(0).toUpperCase() : "G";
    $("user-avatar").textContent = initial;
    $("top-avatar").textContent = initial;
    $("account-action").textContent = signedIn ? "Sign out" : "Sign in";
    $("history-list").innerHTML = signedIn ? "" : '<div class="history-empty">Sign in to see your saved chats.</div>';
  }

  function showWelcome() {
    welcome.classList.remove("hidden");
    thread.classList.add("hidden");
    thread.innerHTML = "";
  }

  function showThread() {
    welcome.classList.add("hidden");
    thread.classList.remove("hidden");
  }

  function addMessage(role, content) {
    const row = document.createElement("div");
    row.className = "message-row " + (role === "user" ? "user" : role === "system" ? "system" : "assistant");
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? (currentUser ? currentUser.email.charAt(0).toUpperCase() : "Y") : role === "system" ? "!" : "K";
    const body = document.createElement("div");
    body.className = "message-content";
    body.textContent = content;
    row.append(avatar, body);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    return row;
  }

  function renderMessages() {
    thread.innerHTML = "";
    messages.forEach(message => addMessage(message.role, message.content));
    showThread();
  }

  function renderHistory() {
    const list = $("history-list");
    list.innerHTML = "";
    if (!conversations.length) {
      list.innerHTML = '<div class="history-empty">Your saved conversations will appear here.</div>';
      return;
    }
    conversations.forEach(conversation => {
      const row = document.createElement("div");
      row.className = "history-item" + (currentConversation?.id === conversation.id ? " active" : "");
      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = conversation.title || "New chat";
      title.title = title.textContent;
      title.addEventListener("click", () => openConversation(conversation));
      const del = document.createElement("button");
      del.className = "delete-chat";
      del.type = "button";
      del.textContent = "×";
      del.title = "Delete conversation";
      del.setAttribute("aria-label", "Delete conversation");
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteConversation(conversation);
      });
      row.append(title, del);
      row.addEventListener("click", () => openConversation(conversation));
      list.appendChild(row);
    });
  }

  async function loadConversations() {
    if (!currentUser || !supabase) return;
    const { data, error } = await supabase.from("conversations")
      .select("id,title,messages,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast("Couldn't load saved chats. Check your Supabase table and policies.");
      console.error(error);
      return;
    }
    conversations = data || [];
    renderHistory();
  }

  async function saveConversation() {
    if (!currentUser || !supabase || !messages.length) return;
    const title = (messages.find(m => m.role === "user")?.content || "New chat").slice(0, 54);
    const payload = { title, messages, updated_at: new Date().toISOString() };
    let result;
    if (currentConversation?.id) {
      result = await supabase.from("conversations").update(payload)
        .eq("id", currentConversation.id).select().single();
    } else {
      result = await supabase.from("conversations").insert({
        ...payload,
        user_id: currentUser.id
      }).select().single();
    }
    if (result.error) {
      console.error(result.error);
      toast("Your reply was sent, but this chat couldn't be saved.");
      return;
    }
    currentConversation = result.data;
    const index = conversations.findIndex(c => c.id === currentConversation.id);
    if (index >= 0) conversations[index] = currentConversation;
    else conversations.unshift(currentConversation);
    conversations.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    renderHistory();
  }

  async function openConversation(conversation) {
    currentConversation = conversation;
    messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    renderMessages();
    renderHistory();
    $("sidebar").classList.remove("open");
  }

  async function deleteConversation(conversation) {
    if (!supabase || !currentUser) return;
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    const { error } = await supabase.from("conversations").delete().eq("id", conversation.id);
    if (error) {
      toast("Couldn't delete this conversation.");
      return;
    }
    conversations = conversations.filter(c => c.id !== conversation.id);
    if (currentConversation?.id === conversation.id) startNewChat();
    renderHistory();
    toast("Conversation deleted.");
  }

  function startNewChat() {
    currentConversation = null;
    messages = [];
    showWelcome();
    renderHistory();
    input.focus();
    $("sidebar").classList.remove("open");
  }

  async function sendPrompt(value) {
    const prompt = (value ?? input.value).trim();
    if (!prompt || busy) return;
    if (!currentUser) {
      openAuth("signin");
      setAuthMessage("Sign in to start and save your conversations.");
      return;
    }
    messages.push({ role: "user", content: prompt });
    input.value = "";
    input.style.height = "auto";
    showThread();
    renderMessages();
    busy = true;
    sendButton.disabled = true;
    const loading = addMessage("assistant", "Kairos GPT is thinking…");
    loading.querySelector(".message-content").classList.add("typing");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages.slice(-20) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The request failed.");
      loading.remove();
      messages.push({ role: "assistant", content: data.response });
      addMessage("assistant", data.response);
      await saveConversation();
    } catch (error) {
      loading.remove();
      const message = error.message || "Connection failed. Please try again.";
      addMessage("system", message);
      messages.pop();
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage("Authentication is still connecting. Refresh the page and try again.", true);
      return;
    }
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    $("auth-submit").disabled = true;
    setAuthMessage(authMode === "signup" ? "Creating your account…" : "Signing you in…");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          currentUser = data.user;
          closeAuth();
          updateAccountUI();
          await loadConversations();
          toast("Your account is ready.");
        } else {
          setAuthMessage("Account created. Check your email for a confirmation link, then sign in.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        closeAuth();
        updateAccountUI();
        await loadConversations();
        toast("Welcome back.");
      }
    } catch (error) {
      setAuthMessage(error.message || "Authentication failed. Please try again.", true);
    } finally {
      $("auth-submit").disabled = false;
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast("Couldn't sign out. Try again.");
      return;
    }
    currentUser = null;
    currentConversation = null;
    conversations = [];
    messages = [];
    updateAccountUI();
    showWelcome();
    startNewChat();
    toast("Signed out.");
  }

  async function init() {
    updateAccountUI();
    $("composer-hint").textContent = "AI can make mistakes. Check important information.";
    try {
      const configResponse = await fetch("/api/config");
      const config = await configResponse.json();
      if (!configResponse.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error("Supabase settings are missing from the server.");
      }
      if (!window.supabase?.createClient) throw new Error("Supabase client failed to load.");
      supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data: { session } } = await supabase.auth.getSession();
      currentUser = session?.user || null;
      updateAccountUI();
      if (currentUser) await loadConversations();
      supabase.auth.onAuthStateChange((_event, sessionNow) => {
        currentUser = sessionNow?.user || null;
        updateAccountUI();
        if (currentUser) {
          window.setTimeout(() => loadConversations(), 0);
        } else {
          conversations = [];
          currentConversation = null;
          messages = [];
          showWelcome();
        }
      });
    } catch (error) {
      console.error(error);
      $("account-status").textContent = "Setup incomplete";
      $("history-list").innerHTML = '<div class="history-empty">Sign-in setup needs attention. Check the Vercel environment variables.</div>';
    }
  }

  $("chat-form").addEventListener("submit", event => {
    event.preventDefault();
    sendPrompt();
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  });
  document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => sendPrompt(button.dataset.prompt));
  });
  $("new-chat").addEventListener("click", startNewChat);
  $("top-signin").addEventListener("click", () => openAuth("signin"));
  $("signin-inline").addEventListener("click", () => openAuth("signin"));
  $("account-action").addEventListener("click", () => currentUser ? signOut() : openAuth("signin"));
  $("top-profile").addEventListener("click", () => currentUser ? signOut() : openAuth("signin"));
  $("close-auth").addEventListener("click", closeAuth);
  $("auth-modal").addEventListener("click", event => { if (event.target === $("auth-modal")) closeAuth(); });
  $("auth-form").addEventListener("submit", handleAuth);
  document.querySelectorAll(".auth-tab").forEach(tab => tab.addEventListener("click", () => setAuthMode(tab.dataset.mode)));
  $("open-sidebar").addEventListener("click", () => $("sidebar").classList.add("open"));
  $("close-sidebar").addEventListener("click", () => $("sidebar").classList.remove("open"));

  init();
})();
