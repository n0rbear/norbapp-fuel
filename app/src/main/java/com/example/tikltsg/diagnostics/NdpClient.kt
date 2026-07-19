package com.example.tikltsg.diagnostics

import java.util.ArrayDeque
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

interface NdpDiagnostics {
    val session: NdpSession
    fun track(event: NdpEvent)
    fun newTraceId(): String = NdpSession.newTraceId()
}

class NdpClient(
    private val config: NdpConfig,
    private val transport: NdpTransport = HttpNdpTransport(),
    private val executor: Executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "norbapp-ndp").apply { isDaemon = true }
    }
) : NdpDiagnostics {
    override val session = NdpSession()
    private val queue = ArrayDeque<QueuedEvent>()
    private val flushing = AtomicBoolean(false)

    override fun track(event: NdpEvent) {
        if (!config.isComplete) return
        runCatching {
            synchronized(queue) {
                if (queue.size >= config.maxQueueSize) queue.removeFirst()
                queue.addLast(QueuedEvent(event))
            }
            flushAsync()
        }
    }

    private fun flushAsync() {
        if (!flushing.compareAndSet(false, true)) return
        executor.execute {
            try {
                flush()
            } catch (_: Throwable) {
            } finally {
                flushing.set(false)
            }
        }
    }

    internal fun queuedCount(): Int = synchronized(queue) { queue.size }

    private fun flush() {
        while (true) {
            val queued = synchronized(queue) { queue.firstOrNull() } ?: return
            val body = NdpJson.event(queued.event, config, session)
            val sent = runCatching { transport.send(config, body) }.getOrDefault(false)
            var stop = false

            synchronized(queue) {
                if (queue.firstOrNull() !== queued) {
                    stop = true
                    return@synchronized
                }
                if (sent || queued.attempts >= config.maxRetries) {
                    queue.removeFirst()
                } else {
                    queue.removeFirst()
                    queue.addLast(queued.copy(attempts = queued.attempts + 1))
                    stop = true
                }
            }
            if (stop) return
        }
    }

    private data class QueuedEvent(val event: NdpEvent, val attempts: Int = 0)
}
