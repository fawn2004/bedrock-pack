package com.example.claudechat

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.errors.RateLimitException
import com.anthropic.helpers.BetaMessageAccumulator
import com.anthropic.models.beta.messages.BetaMessageParam
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.MessageCreateParams
import com.google.android.material.button.MaterialButton
import com.google.android.material.color.MaterialColors
import java.util.concurrent.Executors

const val DEFAULT_MODEL = "claude-opus-5-5"
const val DEFAULT_SYSTEM = "You are a helpful, friendly assistant chatting on a phone. Keep answers clear and reasonably concise."

data class ChatItem(val fromUser: Boolean, var text: String)

class MainActivity : AppCompatActivity() {
    private val prefs by lazy { getSharedPreferences("settings", Context.MODE_PRIVATE) }
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    // Full API conversation, including the assistant's complete content blocks (thinking etc.),
    // so history is sent back unchanged each turn.
    private val history = mutableListOf<BetaMessageParam>()
    private val items = mutableListOf<ChatItem>()
    private lateinit var adapter: ChatAdapter
    private lateinit var list: RecyclerView
    private lateinit var input: EditText
    private lateinit var send: MaterialButton

    private var client: AnthropicClient? = null
    private var clientKey: String? = null
    @Volatile private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        list = findViewById(R.id.messages)
        input = findViewById(R.id.input)
        send = findViewById(R.id.send)
        adapter = ChatAdapter(items)
        list.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        list.adapter = adapter
        send.setOnClickListener { sendMessage() }

        if (apiKey().isBlank()) showSettings()
        else addBot("Hi! Ask me anything.")
    }

    private fun apiKey() = prefs.getString("api_key", "") ?: ""
    private fun model() = prefs.getString("model", DEFAULT_MODEL)?.ifBlank { DEFAULT_MODEL } ?: DEFAULT_MODEL
    private fun systemPrompt() = prefs.getString("system", DEFAULT_SYSTEM) ?: DEFAULT_SYSTEM

    private fun getClient(): AnthropicClient {
        val key = apiKey()
        if (client == null || clientKey != key) {
            client = AnthropicOkHttpClient.builder().apiKey(key).build()
            clientKey = key
        }
        return client!!
    }

    private fun sendMessage() {
        val text = input.text.toString().trim()
        if (text.isEmpty() || busy) return
        if (apiKey().isBlank()) { showSettings(); return }
        input.setText("")
        items.add(ChatItem(true, text))
        val reply = ChatItem(false, "…")
        items.add(reply)
        adapter.notifyItemRangeInserted(items.size - 2, 2)
        list.scrollToPosition(items.size - 1)

        history.add(BetaMessageParam.ofUser(text))
        setBusy(true)

        val model = model()
        val system = systemPrompt()
        executor.execute {
            val sb = StringBuilder()
            try {
                val builder = MessageCreateParams.builder()
                    .model(model)
                    .maxTokens(64000L)
                    .messages(history.toList())
                    .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.MEDIUM).build())
                if (system.isNotBlank()) builder.system(system)
                if (model == DEFAULT_MODEL) {
                    // If a safety classifier declines, let the API retry on a suitable fallback model.
                    builder.addBeta("server-side-fallback-2026-07-01")
                    builder.putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
                }

                val acc = BetaMessageAccumulator.create()
                getClient().beta().messages().createStreaming(builder.build()).use { stream ->
                    stream.stream().forEach { event ->
                        acc.accumulate(event)
                        event.contentBlockDelta().flatMap { it.delta().text() }.ifPresent { d ->
                            sb.append(d.text())
                            val snapshot = sb.toString()
                            main.post { updateReply(reply, snapshot) }
                        }
                    }
                }
                val message = acc.message()
                history.add(message.toParam())
                val refused = message.stopReason().orElse(null) == BetaStopReason.REFUSAL
                val finalText = when {
                    refused && sb.isEmpty() -> "Sorry, I can't help with that one."
                    sb.isEmpty() -> "(no reply)"
                    else -> sb.toString()
                }
                main.post { updateReply(reply, finalText); setBusy(false) }
            } catch (e: Exception) {
                // Drop the unanswered user turn so the conversation stays valid.
                if (history.isNotEmpty()) history.removeAt(history.size - 1)
                val msg = when (e) {
                    is UnauthorizedException -> "Your API key was rejected. Check it in Settings."
                    is RateLimitException -> "Rate limited — wait a moment and try again."
                    is AnthropicServiceException -> "API error ${e.statusCode()}: ${e.message}"
                    else -> "Couldn't reach Claude: ${e.message}"
                }
                main.post { updateReply(reply, "⚠️ $msg"); setBusy(false) }
            }
        }
    }

    private fun updateReply(item: ChatItem, text: String) {
        item.text = text
        val idx = items.indexOf(item)
        if (idx >= 0) adapter.notifyItemChanged(idx)
        list.scrollToPosition(items.size - 1)
    }

    private fun setBusy(b: Boolean) {
        busy = b
        send.isEnabled = !b
        send.text = if (b) "…" else "Send"
    }

    private fun addBot(text: String) {
        items.add(ChatItem(false, text))
        adapter.notifyItemInserted(items.size - 1)
    }

    private fun newChat() {
        if (busy) return
        history.clear()
        items.clear()
        adapter.notifyDataSetChanged()
        addBot("New chat started.")
    }

    private fun showSettings() {
        val v = layoutInflater.inflate(R.layout.dialog_settings, null)
        val key = v.findViewById<EditText>(R.id.api_key).apply { setText(apiKey()) }
        val model = v.findViewById<EditText>(R.id.model).apply { setText(model()) }
        val sys = v.findViewById<EditText>(R.id.system_prompt).apply { setText(systemPrompt()) }
        AlertDialog.Builder(this)
            .setTitle("Settings")
            .setView(v)
            .setPositiveButton("Save") { _, _ ->
                prefs.edit()
                    .putString("api_key", key.text.toString().trim())
                    .putString("model", model.text.toString().trim())
                    .putString("system", sys.text.toString())
                    .apply()
                if (items.isEmpty()) addBot("Saved! Ask me anything.")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.new_chat -> { newChat(); true }
        R.id.settings -> { showSettings(); true }
        else -> super.onOptionsItemSelected(item)
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}

class ChatAdapter(private val items: List<ChatItem>) : RecyclerView.Adapter<ChatAdapter.VH>() {
    class VH(v: View) : RecyclerView.ViewHolder(v) { val text: TextView = v.findViewById(R.id.text) }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_message, parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        val ctx = holder.itemView.context
        holder.text.text = item.text
        holder.text.maxWidth = (ctx.resources.displayMetrics.widthPixels * 0.8).toInt()
        holder.text.background.mutate().setTint(
            ContextCompat.getColor(ctx, if (item.fromUser) R.color.user_bubble else R.color.bot_bubble))
        if (item.fromUser) holder.text.setTextColor(0xFFFFFFFF.toInt())
        else holder.text.setTextColor(MaterialColors.getColor(holder.text, com.google.android.material.R.attr.colorOnSurface))
        (holder.text.layoutParams as FrameLayout.LayoutParams).gravity = if (item.fromUser) Gravity.END else Gravity.START
    }
}
