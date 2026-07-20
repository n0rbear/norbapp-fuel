package com.example.tikltsg.diagnostics

class NdpScreenTracker(private val diagnostics: NdpDiagnostics) {
    private val openedScreens = mutableSetOf<String>()

    fun trackMainOpened() {
        if (openedScreens.add("main")) {
            diagnostics.track(NdpEvents.mainScreenOpened())
        }
    }
}
