package com.example.tikltsg.diagnostics

import java.util.ArrayDeque
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min
import kotlin.random.Random

interface AppDiagnostics {
    val session: NdpSession
    fun track(event: NdpEvent)
    fun startOperation(operation: String): NdpOperationContext = NdpOperationContext(operation = operation)
    fun newTraceId(): String = NdpSession.newTraceId()
    fun flush()
    fun shutdown()
}

interface NdpDiagnostics : AppDiagnostics

class NdpClient(
    private val config: NdpConfig,
    private val transport: NdpTransport = HttpNdpTransport(),
    private val scheduler: NdpTaskScheduler = ScheduledNdpTaskScheduler(Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "norbapp-ndp").apply { isDaemon = true }
    })
) : NdpDiagnostics {
    override val session = NdpSession()
    private val queue = ArrayDeque<QueuedEvent>()
    private val flushing = AtomicBoolean(false)
    private val retryScheduled = AtomicBoolean(false)
    @Volatile
    private var authCircuitOpen = false

    override fun track(event: NdpEvent) {
        if (!config.isComplete) {
            NdpLog.w("event dropped because client is disabled or incomplete type=${event.eventType}")
            return
        }
        if (authCircuitOpen) {
            NdpLog.w("event dropped because auth circuit is open type=${event.eventType}")
            return
        }
        runCatching {
            synchronized(queue) {
                if (queue.size >= config.maxQueueSize) queue.removeFirst()
                queue.addLast(QueuedEvent(event))
                NdpLog.d("event queued type=${event.eventType} trace=${event.traceId} queueSize=${queue.size}")
            }
            flushAsync()
        }.onFailure {
            NdpLog.w("event queue failure type=${event.eventType}", it)
        }
    }

    override fun flush() {
        flushAsync()
    }

    override fun shutdown() {
        flushAsync()
        scheduler.shutdown()
    }

    private fun flushAsync() {
        if (!flushing.compareAndSet(false, true)) return
        scheduler.execute {
            try {
                flushQueue()
            } catch (throwable: Throwable) {
                NdpLog.w("flush failed ${throwable::class.java.simpleName}", throwable)
            } finally {
                flushing.set(false)
                if (queuedCount() > 0 && !retryScheduled.get() && !authCircuitOpen) {
                    scheduleRetry(config.initialBackoffMillis)
                }
            }
        }
    }

    internal fun queuedCount(): Int = synchronized(queue) { queue.size }

    private fun flushQueue() {
        while (true) {
            if (authCircuitOpen) return
            val queued = synchronized(queue) { queue.firstOrNull() } ?: return
            val body = NdpJson.event(queued.event, config, session)
            val result = runCatching { transport.send(config, body) }.getOrElse {
                NdpTransportResult.RetryableFailure(null, causeType = it::class.java.simpleName)
            }
            var stop = false

            synchronized(queue) {
                if (queue.firstOrNull() !== queued) {
                    stop = true
                    return@synchronized
                }
                when (result) {
                    is NdpTransportResult.Accepted -> {
                        queue.removeFirst()
                        NdpLog.d("event accepted type=${queued.event.eventType} status=${result.statusCode} attempts=${queued.attempts + 1} queueSize=${queue.size}")
                    }
                    is NdpTransportResult.PermanentFailure -> {
                        queue.removeFirst()
                        NdpLog.w("event rejected permanently type=${queued.event.eventType} status=${result.statusCode} reason=${result.reason}")
                    }
                    is NdpTransportResult.AuthenticationFailure -> {
                        queue.clear()
                        authCircuitOpen = true
                        NdpLog.w("auth circuit opened status=${result.statusCode}")
                        stop = true
                    }
                    is NdpTransportResult.RetryableFailure -> {
                        queue.removeFirst()
                        if (queued.attempts + 1 >= config.maxRetries) {
                            NdpLog.w("event rejected after retries type=${queued.event.eventType} attempts=${queued.attempts + 1} status=${result.statusCode}")
                        } else {
                            val retry = queued.copy(attempts = queued.attempts + 1)
                            queue.addFirst(retry)
                            scheduleRetry(retry.delayMillis(result.retryAfterMs))
                        }
                        stop = true
                    }
                }
            }
            if (stop) return
        }
    }

    private fun scheduleRetry(delayMillis: Long) {
        if (!retryScheduled.compareAndSet(false, true)) return
        val safeDelay = delayMillis.coerceIn(0, config.maxBackoffMillis)
        NdpLog.w("event retry scheduled delayMs=$safeDelay")
        scheduler.schedule(safeDelay) {
            retryScheduled.set(false)
            flushAsync()
        }
    }

    private fun QueuedEvent.delayMillis(retryAfterMs: Long?): Long {
        val exponential = config.initialBackoffMillis * (1L shl attempts.coerceAtMost(10))
        val jitter = Random.nextLong(0, (config.initialBackoffMillis / 2).coerceAtLeast(1))
        return retryAfterMs ?: min(config.maxBackoffMillis, exponential + jitter)
    }

    private data class QueuedEvent(val event: NdpEvent, val attempts: Int = 0)
}

data class NdpOperationContext(
    val traceId: String = NdpSession.newTraceId(),
    val operation: String,
    val startedAtMs: Long = System.currentTimeMillis()
)

interface NdpTaskScheduler {
    fun execute(command: () -> Unit)
    fun schedule(delayMillis: Long, command: () -> Unit)
    fun shutdown()
}

private class ScheduledNdpTaskScheduler(
    private val executor: ScheduledExecutorService
) : NdpTaskScheduler {
    override fun execute(command: () -> Unit) {
        executor.execute(command)
    }

    override fun schedule(delayMillis: Long, command: () -> Unit) {
        executor.schedule(command, delayMillis, TimeUnit.MILLISECONDS)
    }

    override fun shutdown() {
        executor.shutdown()
    }
}
