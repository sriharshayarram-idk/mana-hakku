package org.manahakku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.util.Locale

/**
 * Mana Hakku hosts its bilingual page (assets/index.html) in a WebView and gives it
 * three phone abilities through JavaScript bridges:
 *  - AndroidTTS   : read text aloud with the phone's Telugu or English voice
 *  - AndroidVoice : speak a complaint in Telugu or English (Google speech dialog)
 *  - AndroidShare : send a report to WhatsApp, SMS or email through the share sheet
 */
class MainActivity : Activity(), TextToSpeech.OnInitListener {

    private lateinit var web: WebView
    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false
            textZoom = 100
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "file") return false
                openExternal(uri)
                return true
            }
        }
        web.addJavascriptInterface(TtsBridge(), "AndroidTTS")
        web.addJavascriptInterface(VoiceBridge(), "AndroidVoice")
        web.addJavascriptInterface(ShareBridge(), "AndroidShare")

        tts = TextToSpeech(this, this)

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("file:///android_asset/index.html")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
        }
    }

    private fun js(code: String) {
        runOnUiThread { web.evaluateJavascript(code, null) }
    }

    // ---------- Text to speech ----------
    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
                if (utteranceId == LAST_ID) js("window.mhSpeechDone && window.mhSpeechDone()")
            }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                js("window.mhSpeechDone && window.mhSpeechDone()")
            }
        })
    }

    inner class TtsBridge {
        @JavascriptInterface
        fun ready(): Boolean = ttsReady

        @JavascriptInterface
        fun hasLang(lang: String): Boolean {
            val engine = tts ?: return false
            if (!ttsReady) return false
            return engine.isLanguageAvailable(Locale.forLanguageTag(lang)) >= TextToSpeech.LANG_AVAILABLE
        }

        @JavascriptInterface
        fun speak(text: String, lang: String) {
            val engine = tts ?: return
            if (!ttsReady) {
                js("window.mhSpeechDone && window.mhSpeechDone()")
                return
            }
            engine.language = Locale.forLanguageTag(lang)
            engine.setSpeechRate(if (lang.startsWith("te")) 0.9f else 0.97f)
            val parts = splitForSpeech(text)
            parts.forEachIndexed { i, part ->
                val mode = if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
                val id = if (i == parts.lastIndex) LAST_ID else "mh-$i"
                engine.speak(part, mode, null, id)
            }
            if (parts.isEmpty()) js("window.mhSpeechDone && window.mhSpeechDone()")
        }

        @JavascriptInterface
        fun stop() {
            tts?.stop()
        }
    }

    private fun splitForSpeech(text: String): List<String> {
        val max = minOf(TextToSpeech.getMaxSpeechInputLength() - 50, 1500)
        val sentences = text.split(Regex("(?<=[.!?।;:\\n])\\s+"))
        val out = mutableListOf<String>()
        val cur = StringBuilder()
        for (s in sentences) {
            if (cur.length + s.length + 1 > max && cur.isNotEmpty()) {
                out.add(cur.toString()); cur.clear()
            }
            if (cur.isNotEmpty()) cur.append(' ')
            cur.append(s)
        }
        if (cur.isNotBlank()) out.add(cur.toString())
        return out.filter { it.isNotBlank() }
    }

    // ---------- Voice input ----------
    inner class VoiceBridge {
        @JavascriptInterface
        fun listen(lang: String) {
            runOnUiThread {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
                    putExtra(RecognizerIntent.EXTRA_PROMPT, if (lang.startsWith("te")) "మాట్లాడండి" else "Speak now")
                }
                try {
                    startActivityForResult(intent, VOICE_REQUEST)
                } catch (_: ActivityNotFoundException) {
                    js("window.mhVoiceError && window.mhVoiceError('unavailable')")
                }
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != VOICE_REQUEST) return
        val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (resultCode == RESULT_OK && !text.isNullOrBlank()) {
            js("window.mhVoiceResult && window.mhVoiceResult(${JSONObject.quote(text)})")
        } else {
            js("window.mhVoiceError && window.mhVoiceError('cancelled')")
        }
    }

    // ---------- Share ----------
    inner class ShareBridge {
        @JavascriptInterface
        fun share(text: String) {
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(send, getString(R.string.app_name)))
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val VOICE_REQUEST = 41
        private const val LAST_ID = "mh-last"
    }
}
