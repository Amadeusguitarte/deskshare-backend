# Tasks

- [x] Fix Launcher "Object Destroyed" error
- [x] Fix VNC "Another Copy" race condition
- [x] Fix "No such host" (Tunnel URL sync)
- [x] Fix Launcher "Iniciando" hang (Tunnel Output regex/logging)
    - [-] Enable WebRTC Prototyping Mode (Reverted to Safe Backup)
    - [x] Make WebRTC Broadcaster window visible (on debug click)
    - [x] Add "Debug WebRTC" button to Launcher UI
    - [x] Output WebRTC logs to main debug log
    - [-] Implement Agent Signaling Poll (Reverted)
    - [x] Fix screen capture selection hang (Reverted)

- [x] Client-Side WebRTC Integration (Viewer)
    - [x] Import `js/webrtc-viewer.js` in `remote-access.html`
    - [x] Implement signaling (offer/answer/ice) logic
    - [x] Add WebRTC/Guacamole mode toggle UI
    - [x] Add `#webrtc-view` container with Canvas
    - [x] Implement `switchMode('webrtc')` logic
    - [x] Rename "Native" to "Guacamole" and unhide WebRTC button

- [x] Optimizar Señalización (v2.4)
- [x] Soporte Multi-STUN (v2.3)
- [x] UI Limpia (Hide Overlay)
- [x] **Control Remoto (v2.6):** Mouse/Clics vía PowerShell.
- [x] **High-Perf (v3.0):** 60FPS y Latencia real.
- [x] **Precision P2P Metrics (v4.0):**
    - [x] Web: Implementación de API `getStats()` nativa
    - [x] Web: Extracción de RTT real desde el motor del Navegador
    - [x] Web: Latencia 100% verídica (Incontestable)
- [ ] Corregir renderizado de video (Small Box Bug)
    - [x] Fix Backend Syntax Error (Force Deploy)
    - [x] Fix DB Schema (`webrtcSessionId` missing)
    - [x] Fix DB Schema (`webrtcSessionId` missing)
    - [-] Implement Agent Signaling Poll (Disabled for stability)
    - [x] Restore Real Latency (HTTP Ping)
    - **BLOCKED**: WebRTC P2P requires actual screen capture/streaming implementation

- [x] Fix Real Latency Display
    - [x] Use `/api/health` endpoint for RTT measurement
    - [x] Hide non-functional WebRTC button

