package org.manahakku.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.view.WindowManager
import android.widget.Toast
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
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
 *  - AndroidPrint : print or "Save as PDF" a generated report
 *  - AndroidFile  : save an exported file (CSV) to the Downloads folder
 *  - AndroidScreen: block screenshots and screen recording while reports are on screen
 */
class MainActivity : Activity(), TextToSpeech.OnInitListener {

    private lateinit var web: WebView
    private var tts: TextToSpeech? = null
    private var printView: WebView? = null
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
                if (uri.scheme == "https" && uri.host == ASSET_HOST) return false
                openExternal(uri)
                return true
            }

            // The PDF reader and the Constitution PDFs are served from the app's own assets under a private https address.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (uri.scheme != "https" || uri.host != ASSET_HOST) return null
                val path = uri.path ?: return notFound()
                if (!path.startsWith("/assets/") || path.contains("..")) return notFound()
                val file = path.removePrefix("/assets/")
                return try {
                    val res = WebResourceResponse(mimeFor(file), null, assets.open(file))
                    res.responseHeaders = mapOf("Cache-Control" to "max-age=86400")
                    res
                } catch (e: Exception) { notFound() }
            }
        }
        web.addJavascriptInterface(TtsBridge(), "AndroidTTS")
        web.addJavascriptInterface(VoiceBridge(), "AndroidVoice")
        web.addJavascriptInterface(ShareBridge(), "AndroidShare")
        web.addJavascriptInterface(PrintBridge(), "AndroidPrint")
        web.addJavascriptInterface(FileBridge(), "AndroidFile")
        web.addJavascriptInterface(ScreenBridge(), "AndroidScreen")

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

    // ---------- Print / Save as PDF ----------
    inner class PrintBridge {
        @JavascriptInterface
        fun print(html: String, title: String) {
            runOnUiThread {
                val view = WebView(this@MainActivity)
                view.settings.javaScriptEnabled = false
                view.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(v: WebView, url: String?) {
                        val manager = getSystemService(PRINT_SERVICE) as PrintManager
                        val attrs = PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                            .build()
                        manager.print(title, v.createPrintDocumentAdapter(title), attrs)
                    }
                }
                view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
                printView = view
            }
        }
    }

    // ---------- Save file to Downloads ----------
    inner class FileBridge {
        @JavascriptInterface
        fun save(name: String, mime: String, content: String): String {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "unsupported"
            return try {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return "failed"
                contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray(Charsets.UTF_8)) }
                    ?: return "failed"
                runOnUiThread { Toast.makeText(this@MainActivity, "Downloads/$name", Toast.LENGTH_LONG).show() }
                "saved"
            } catch (_: Exception) {
                "failed"
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.mhBack && window.mhBack()) ? 'y' : 'n'") { r ->
            if (r?.contains("y") == true) return@evaluateJavascript
            if (web.canGoBack()) web.goBack() else finish()
        }
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
        private const val ASSET_HOST = "appassets.androidplatform.net"
    }

    // ---------- Screenshot block for the reports view ----------
    inner class ScreenBridge {
        @JavascriptInterface
        fun secure(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }

    private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))

    private fun mimeFor(f: String): String = when (f.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "mjs", "js" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "ftl", "txt" -> "text/plain"
        "pdf" -> "application/pdf"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "gif" -> "image/gif"
        "wasm" -> "application/wasm"
        "ttf" -> "font/ttf"
        "otf" -> "font/otf"
        "woff2" -> "font/woff2"
        else -> "application/octet-stream"
    }
}
