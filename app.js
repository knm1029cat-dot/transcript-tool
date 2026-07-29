(() => {
  "use strict";

  // ---- タブ切り替え ----
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  // ---- リアルタイム文字起こし (Web Speech API) ----
  const realtimeOutput = document.getElementById("realtime-output");
  const btnStart = document.getElementById("btn-start");
  const btnStop = document.getElementById("btn-stop");
  const recStatus = document.getElementById("rec-status");
  const unsupportedNotice = document.getElementById("realtime-unsupported");

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;
  let finalTranscript = "";

  if (!SpeechRecognition) {
    unsupportedNotice.classList.remove("hidden");
    btnStart.disabled = true;
  } else {
    recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      realtimeOutput.value = finalTranscript + interim;
      realtimeOutput.scrollTop = realtimeOutput.scrollHeight;
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      recStatus.textContent = `エラー: ${event.error}`;
      recStatus.classList.remove("recording");
      stopRecording();
    };

    recognition.onend = () => {
      if (isRecording) {
        // 無音などで自動停止した場合は録音状態を維持して再開する
        try {
          recognition.start();
        } catch (e) {
          // 既に開始中などは無視
        }
      }
    };
  }

  function startRecording() {
    if (!recognition || isRecording) return;
    isRecording = true;
    try {
      recognition.start();
    } catch (e) {
      isRecording = false;
      return;
    }
    btnStart.disabled = true;
    btnStop.disabled = false;
    recStatus.textContent = "● 録音中...";
    recStatus.classList.add("recording");
  }

  function stopRecording() {
    if (!recognition) return;
    isRecording = false;
    recognition.stop();
    btnStart.disabled = false;
    btnStop.disabled = true;
    recStatus.textContent = "停止しました";
    recStatus.classList.remove("recording");
  }

  btnStart.addEventListener("click", startRecording);
  btnStop.addEventListener("click", stopRecording);

  document.getElementById("btn-clear-realtime").addEventListener("click", () => {
    finalTranscript = "";
    realtimeOutput.value = "";
  });

  document.getElementById("btn-copy-realtime").addEventListener("click", () => {
    copyToClipboard(realtimeOutput.value);
  });

  document.getElementById("btn-download-realtime").addEventListener("click", () => {
    downloadText(realtimeOutput.value, "realtime-transcript.txt");
  });

  // ---- ファイルアップロード文字起こし (OpenAI Whisper API) ----
  const apiKeyInput = document.getElementById("api-key");
  const rememberKeyCheckbox = document.getElementById("remember-key");
  const audioFileInput = document.getElementById("audio-file");
  const btnTranscribe = document.getElementById("btn-transcribe");
  const uploadStatus = document.getElementById("upload-status");
  const uploadOutput = document.getElementById("upload-output");

  const STORAGE_KEY = "transcript-tool.openai-api-key";
  const savedKey = localStorage.getItem(STORAGE_KEY);
  if (savedKey) {
    apiKeyInput.value = savedKey;
    rememberKeyCheckbox.checked = true;
  }

  rememberKeyCheckbox.addEventListener("change", () => {
    if (!rememberKeyCheckbox.checked) {
      localStorage.removeItem(STORAGE_KEY);
    }
  });

  btnTranscribe.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const file = audioFileInput.files[0];

    if (!apiKey) {
      uploadStatus.textContent = "APIキーを入力してください。";
      return;
    }
    if (!file) {
      uploadStatus.textContent = "音声ファイルを選択してください。";
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      uploadStatus.textContent = "ファイルサイズが25MBを超えています。";
      return;
    }

    if (rememberKeyCheckbox.checked) {
      localStorage.setItem(STORAGE_KEY, apiKey);
    }

    btnTranscribe.disabled = true;
    uploadStatus.textContent = "文字起こし中...";
    uploadOutput.value = "";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", "whisper-1");
    formData.append("language", "ja");
    formData.append("response_format", "text");

    try {
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let message = `エラー (HTTP ${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson?.error?.message) {
            message = errJson.error.message;
          }
        } catch (e) {
          // JSON以外のエラー応答は無視
        }
        throw new Error(message);
      }

      const text = await response.text();
      uploadOutput.value = text.trim();
      uploadStatus.textContent = "完了しました。";
    } catch (err) {
      uploadStatus.textContent = `失敗しました: ${err.message}`;
    } finally {
      btnTranscribe.disabled = false;
    }
  });

  document.getElementById("btn-copy-upload").addEventListener("click", () => {
    copyToClipboard(uploadOutput.value);
  });

  document.getElementById("btn-download-upload").addEventListener("click", () => {
    downloadText(uploadOutput.value, "upload-transcript.txt");
  });

  // ---- 共通ユーティリティ ----
  function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {
      // クリップボードAPIが使えない環境では無視
    });
  }

  function downloadText(text, filename) {
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
})();
