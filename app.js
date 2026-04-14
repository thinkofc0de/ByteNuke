// app.js - FINAL STABLE VERSION (Aligned with architecture)

import { Host } from './host.js';
import { Receiver } from './receiver.js';

console.log("🚀 App initialized ✅");

let host = null;
let receiver = null;

// --------------------
// Helper UI functions
// --------------------
function showError(msg) {
    console.error("❌ UI ERROR:", msg);
    const el = document.getElementById('error-box');
    if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
}

function showLoading(msg) {
    const el = document.getElementById('loading-text');
    if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
}

function hideLoading() {
    const el = document.getElementById('loading-text');
    if (el) el.classList.add('hidden');
}

function showPreviewError(container) {
    container.innerHTML = `
        <div style="color:red; font-size:18px; text-align:center;">
            ⚠️ Preview not supported
        </div>
    `;
}

// --------------------
// HOST MODE
// --------------------
document.getElementById('try-host-btn').addEventListener('click', async () => {
    console.log("🟢 Host button clicked");

    // Switch UI
    document.getElementById('mode-selection').classList.add('hidden');
    document.getElementById('host-panel').classList.remove('hidden');

    try {
        console.log("🟡 Creating Host...");
        host = new Host();

        console.log("🟡 Calling init...");
        const roomId = await host.init();

        console.log("🟢 Room created:", roomId);

        // ✅ Show room UI
        document.getElementById('room-id').textContent = roomId;
        document.getElementById('room-section').classList.remove('hidden');
        document.getElementById('file-section').classList.remove('hidden');
        document.getElementById('timer-section').classList.remove('hidden');

    } catch (err) {
        console.error("❌ HOST INIT FAILED:", err);
        showError("Failed to initialize host. Check console.");
    }
});

// --------------------
// FILE SELECT
// --------------------
document.getElementById('select-file-btn').addEventListener('click', async () => {
    if (host && host.pc) {
    showError("Session already active. Cannot add/modify files.");
    return;
}
    if (!host) {
        showError("Host not initialized");
        return;
    }

    try {
        const fileInfo = await host.selectFile();

        if (fileInfo) {
    console.log("📁 File selected:", fileInfo);

    document.getElementById('file-size').textContent =
        `${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`;

    // 🔥 ONLY show button if session NOT started
    if (!host.pc) {
        document.getElementById('host-now-btn').classList.remove('hidden');
    }
}

    } catch (err) {
        console.error("❌ File select error:", err);
        showError("File selection failed");
    }
});

// --------------------
// START HOSTING
// --------------------
document.getElementById('host-now-btn').addEventListener('click', async () => {

    if (!host) return;

    await host.startHosting();
    const minutes = parseInt(document.getElementById('timer-input').value);

    if (isNaN(minutes) || minutes < 1 || minutes > 10) {
        showError("Time must be between 1 and 10 minutes");
        return;
    }

    try {
        console.log("⏱ Starting session...");

        await host.setTimer(minutes);

        document.getElementById('host-now-btn').classList.add('hidden');
        document.getElementById('transfer-status').classList.remove('hidden');
        document.getElementById('end-session-btn').classList.remove('hidden');
        document.getElementById('select-file-btn').disabled = true;
        document.getElementById('select-file-btn').textContent = "Session Active";

        document.getElementById('status-text').textContent = "Online for ";

    } catch (err) {
        console.error("❌ Hosting start failed:", err);
        showError("Failed to start hosting");
    }
});

// --------------------
// COPY ROOM ID
// --------------------
document.getElementById('copy-room-id-btn').addEventListener('click', () => {
    const roomId = document.getElementById('room-id').textContent;

    navigator.clipboard.writeText(roomId);

    const status = document.getElementById('copy-status');
    status.textContent = "Copied!";
    setTimeout(() => status.textContent = "", 2000);
});

// --------------------
// END SESSION
// --------------------
document.getElementById('end-session-btn').addEventListener('click', async () => {
    if (host) {
        console.log("🛑 Ending session...");
        await host.cleanup();
        location.reload();
    }
});

// --------------------
// RECEIVER MODE
// --------------------
document.getElementById('receiver-btn').addEventListener('click', () => {
    console.log("📥 Receiver clicked");

    document.getElementById('mode-selection').classList.add('hidden');
    document.getElementById('receiver-panel').classList.remove('hidden');
});


// --------------------
// JOIN ROOM
// --------------------
document.getElementById('join-room-btn').addEventListener('click', async () => {
    const roomId = document.getElementById('room-id-input').value.trim();

    if (!roomId || roomId.length < 5) {
        showError("Invalid Room ID");
        return;
    }

    receiver = new Receiver();

    try {
        console.log("🔗 Joining room:", roomId);

        showLoading("Joining room...");
        await receiver.joinRoom(roomId);
hideLoading();

// ✅ SHOW FILE LIST PANEL
document.getElementById('file-list-panel').classList.remove('hidden');

       

    } catch (err) {
        console.error("❌ Join failed:", err);
        hideLoading();
        showError("Failed to join room");
    }
});

// --------------------
// DOWNLOAD
// --------------------


// --------------------
// CLEANUP
// --------------------
window.addEventListener('beforeunload', async () => {
    if (host) await host.cleanup();
    if (receiver) await receiver.cleanup();
});